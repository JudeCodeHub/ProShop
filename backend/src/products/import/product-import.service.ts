import {
  BadRequestException,
  HttpException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { parse } from 'csv-parse/sync';
import { isPrismaError, PrismaErrorCode } from '../../prisma/prisma-errors.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { VariantsService } from '../../variants/variants.service.js';
import { ImportRowDto } from './import-row.dto.js';

export const MAX_IMPORT_ROWS = 5000;

const COLUMNS = {
  name: 'name',
  category: 'category',
  brand: 'brand',
  costprice: 'costPrice',
  size: 'size',
  color: 'color',
  sellprice: 'sellPrice',
  stockqty: 'stockQty',
} as const;

type ColumnKey = keyof typeof COLUMNS;

interface ParsedRow {
  row: number;
  data: Record<string, string | undefined>;
}

export interface ImportRowError {
  row: number;
  messages: string[];
}

export interface ImportSummary {
  processed: number;
  created: number;
  skipped: number;
  categoriesCreated: number;
  productsCreated: number;
  errors: ImportRowError[];
}

@Injectable()
export class ProductImportService {
  private readonly logger = new Logger(ProductImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly variants: VariantsService,
  ) {}

  async import(csv: Buffer): Promise<ImportSummary> {
    const rows = this.parse(csv);
    const summary: ImportSummary = {
      processed: 0,
      created: 0,
      skipped: 0,
      categoriesCreated: 0,
      productsCreated: 0,
      errors: [],
    };

    for (const { row, data } of rows) {
      summary.processed++;
      const messages = await this.importRow(data, summary);
      if (messages) {
        summary.skipped++;
        summary.errors.push({ row, messages });
      } else {
        summary.created++;
      }
    }
    return summary;
  }

  private async importRow(
    data: ParsedRow['data'],
    summary: ImportSummary,
  ): Promise<string[] | null> {
    const dto = plainToInstance(ImportRowDto, data);
    const failures = await validate(dto);
    if (failures.length) {
      return failures.flatMap((f) => Object.values(f.constraints ?? {}));
    }

    try {
      const productId = await this.findOrCreateProduct(dto, summary);
      await this.variants.create(productId, {
        size: dto.size,
        color: dto.color,
        sellPrice: dto.sellPrice,
        stockQty: dto.stockQty,
      });
      return null;
    } catch (error) {
      if (error instanceof HttpException) {
        return [error.message];
      }
      this.logger.error('Unexpected error while importing a CSV row', error);
      return ['Unexpected error while importing this row'];
    }
  }

  private async findOrCreateProduct(dto: ImportRowDto, summary: ImportSummary) {
    const existing = await this.prisma.product.findFirst({
      where: {
        name: { equals: dto.name, mode: 'insensitive' },
        brand: { equals: dto.brand, mode: 'insensitive' },
      },
      select: { id: true, category: { select: { name: true } } },
      orderBy: { id: 'asc' },
    });

    if (existing) {
      if (existing.category.name.toLowerCase() !== dto.category.toLowerCase()) {
        throw new BadRequestException(
          `Product "${dto.name}" by ${dto.brand} already exists in category "${existing.category.name}"`,
        );
      }
      return existing.id;
    }

    const categoryId = await this.findOrCreateCategory(dto.category, summary);
    const product = await this.prisma.product.create({
      data: {
        name: dto.name,
        brand: dto.brand,
        costPrice: dto.costPrice,
        categoryId,
      },
      select: { id: true },
    });
    summary.productsCreated++;
    return product.id;
  }

  private async findOrCreateCategory(name: string, summary: ImportSummary) {
    const find = () =>
      this.prisma.category.findFirst({
        where: { name: { equals: name, mode: 'insensitive' } },
        select: { id: true },
      });

    const existing = await find();
    if (existing) {
      return existing.id;
    }

    try {
      const category = await this.prisma.category.create({
        data: { name },
        select: { id: true },
      });
      summary.categoriesCreated++;
      return category.id;
    } catch (error) {
      const raced = isPrismaError(error, PrismaErrorCode.UniqueViolation)
        ? await find()
        : null;
      if (raced) {
        return raced.id;
      }
      throw error;
    }
  }

  private parse(csv: Buffer): ParsedRow[] {
    let header: string[] | undefined;
    let records: { record: Record<string, string | undefined>; info: { lines: number } }[];

    try {
      records = parse(csv, {
        bom: true,
        columns: (names: string[]) => {
          header = names.map((n) => n.trim().toLowerCase());
          return header;
        },
        info: true,
        relax_column_count: true,
        skip_empty_lines: true,
        trim: true,
      });
    } catch (error) {
      throw new BadRequestException(
        `Could not read the CSV file: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    if (!header) {
      throw new BadRequestException('The CSV file is empty');
    }

    const missing = (Object.keys(COLUMNS) as ColumnKey[])
      .filter((key) => !header?.includes(key))
      .map((key) => COLUMNS[key]);
    if (missing.length) {
      throw new BadRequestException(`Missing columns: ${missing.join(', ')}`);
    }
    if (records.length === 0) {
      throw new BadRequestException('The CSV file has no data rows');
    }
    if (records.length > MAX_IMPORT_ROWS) {
      throw new BadRequestException(
        `The CSV file has ${records.length} rows; the limit is ${MAX_IMPORT_ROWS}`,
      );
    }

    return records.map(({ record, info }) => ({
      row: info.lines,
      data: Object.fromEntries(
        (Object.keys(COLUMNS) as ColumnKey[]).map((key) => [COLUMNS[key], record[key]]),
      ),
    }));
  }
}
