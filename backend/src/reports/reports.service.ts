import { Injectable } from '@nestjs/common';
import { STORE_TIME_ZONE } from '../common/store-time.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  BestSellersQueryDto,
  DateRangeQueryDto,
  RevenueByCategoryQueryDto,
  SalesSummaryQueryDto,
} from './dto/report-queries.dto.js';
import {
  addDays,
  resolveRange,
  startOfMonthsBack,
  startOfWeeksBack,
  type DateRange,
} from './report-range.js';

type Decimal = Prisma.Decimal;
type Numeric = Decimal | string | number | null;

const dec = (value: Numeric) => new Prisma.Decimal(value ?? 0);
const money = (value: Numeric) => dec(value).toFixed(2);
const percentOf = (part: Decimal, whole: Decimal) =>
  whole.isZero() ? null : part.dividedBy(whole).times(100).toFixed(2);
const sum = (values: Numeric[]) =>
  values.reduce<Decimal>((total, value) => total.plus(dec(value)), new Prisma.Decimal(0));

const PERIOD_UNIT = { daily: 'day', weekly: 'week', monthly: 'month' } as const;
const last30Days = (to: string) => addDays(to, -29);

function ordersIn(range: DateRange, status: 'completed' | 'voided' = 'completed') {
  return Prisma.sql`
    o.status = ${status}::"OrderStatus"
    AND o."createdAt" >= (${range.from}::date::timestamp AT TIME ZONE ${STORE_TIME_ZONE}::text) AT TIME ZONE 'UTC'
    AND o."createdAt" < ((${range.to}::date + 1)::timestamp AT TIME ZONE ${STORE_TIME_ZONE}::text) AT TIME ZONE 'UTC'`;
}

function netLines(range: DateRange) {
  return Prisma.sql`
    lines AS (
      SELECT
        oi."variantId",
        oi.qty,
        oi."priceAtSale" * oi.qty * (o.total - o.tax)
          / NULLIF(SUM(oi."priceAtSale" * oi.qty) OVER (PARTITION BY oi."orderId"), 0) AS net
      FROM "OrderItem" oi
      JOIN "Order" o ON o.id = oi."orderId"
      WHERE ${ordersIn(range)}
    )`;
}

interface SummaryRow {
  periodStart: string;
  orders: number;
  itemsSold: number;
  grossSales: Numeric;
  discounts: Numeric;
  netSales: Numeric;
  tax: Numeric;
  total: Numeric;
}

interface BestSellerRow {
  variantId: number;
  sku: string;
  productName: string;
  brand: string;
  category: string;
  size: string;
  color: string;
  unitsSold: number;
  revenue: Numeric;
  stockLeft: number;
}

interface RevenueRow {
  categoryId: number | null;
  name: string;
  unitsSold: number;
  revenue: Numeric;
}

interface StaffRow {
  userId: number;
  name: string;
  role: string;
  orders: number;
  itemsSold: number;
  netSales: Numeric;
  total: Numeric;
  voidedOrders: number;
}

interface StockRow {
  categoryId: number;
  name: string;
  units: number;
  costValue: Numeric;
  retailValue: Numeric;
}

interface ProfitRow {
  netSales: Numeric;
  cost: Numeric;
  unitsSold: number;
}

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async salesSummary(query: SalesSummaryQueryDto) {
    const period = query.period ?? 'daily';
    const range = resolveRange(query, (to) =>
      period === 'monthly'
        ? startOfMonthsBack(to, 11)
        : period === 'weekly'
          ? startOfWeeksBack(to, 11)
          : last30Days(to),
    );
    const unit = PERIOD_UNIT[period];

    const rows = await this.prisma.$queryRaw<SummaryRow[]>`
      WITH buckets AS (
        SELECT generate_series(
          date_trunc(${unit}::text, ${range.from}::date::timestamp),
          date_trunc(${unit}::text, ${range.to}::date::timestamp),
          ('1 ' || ${unit}::text)::interval
        )::date AS bucket
      ),
      completed AS (
        SELECT
          o.total,
          o.tax,
          o.discount,
          date_trunc(${unit}::text, (o."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${STORE_TIME_ZONE}::text)::date AS bucket,
          (SELECT COALESCE(SUM(oi.qty), 0) FROM "OrderItem" oi WHERE oi."orderId" = o.id) AS units
        FROM "Order" o
        WHERE ${ordersIn(range)}
      )
      SELECT
        to_char(b.bucket, 'YYYY-MM-DD') AS "periodStart",
        COUNT(c.bucket)::int AS orders,
        COALESCE(SUM(c.units), 0)::int AS "itemsSold",
        COALESCE(SUM(c.total - c.tax + c.discount), 0) AS "grossSales",
        COALESCE(SUM(c.discount), 0) AS discounts,
        COALESCE(SUM(c.total - c.tax), 0) AS "netSales",
        COALESCE(SUM(c.tax), 0) AS tax,
        COALESCE(SUM(c.total), 0) AS total
      FROM buckets b
      LEFT JOIN completed c ON c.bucket = b.bucket
      GROUP BY b.bucket
      ORDER BY b.bucket`;

    const figures = (r: Omit<SummaryRow, 'periodStart' | 'orders' | 'itemsSold'>) => ({
      grossSales: money(r.grossSales),
      discounts: money(r.discounts),
      netSales: money(r.netSales),
      tax: money(r.tax),
      total: money(r.total),
    });

    return {
      period,
      ...range,
      timeZone: STORE_TIME_ZONE,
      buckets: rows.map((r) => ({
        periodStart: r.periodStart,
        orders: r.orders,
        itemsSold: r.itemsSold,
        ...figures(r),
      })),
      totals: {
        orders: rows.reduce((n, r) => n + r.orders, 0),
        itemsSold: rows.reduce((n, r) => n + r.itemsSold, 0),
        ...figures({
          grossSales: sum(rows.map((r) => r.grossSales)),
          discounts: sum(rows.map((r) => r.discounts)),
          netSales: sum(rows.map((r) => r.netSales)),
          tax: sum(rows.map((r) => r.tax)),
          total: sum(rows.map((r) => r.total)),
        }),
      },
    };
  }

  async bestSellers(query: BestSellersQueryDto) {
    const range = resolveRange(query, last30Days);
    const limit = query.limit ?? 10;

    const rows = await this.prisma.$queryRaw<BestSellerRow[]>`
      WITH ${netLines(range)}
      SELECT
        v.id AS "variantId",
        v.sku,
        p.name AS "productName",
        p.brand,
        c.name AS category,
        v.size,
        v.color,
        SUM(l.qty)::int AS "unitsSold",
        SUM(l.net) AS revenue,
        v."stockQty" AS "stockLeft"
      FROM lines l
      JOIN "ProductVariant" v ON v.id = l."variantId"
      JOIN "Product" p ON p.id = v."productId"
      JOIN "Category" c ON c.id = p."categoryId"
      GROUP BY v.id, p.id, c.id
      ORDER BY "unitsSold" DESC, revenue DESC, v.id
      LIMIT ${limit}`;

    return {
      ...range,
      limit,
      items: rows.map((r) => ({ ...r, revenue: money(r.revenue) })),
    };
  }

  async revenueByCategory(query: RevenueByCategoryQueryDto) {
    const range = resolveRange(query, last30Days);
    const by = query.by ?? 'category';

    const rows =
      by === 'brand'
        ? await this.prisma.$queryRaw<RevenueRow[]>`
            WITH ${netLines(range)}
            SELECT NULL::int AS "categoryId", p.brand AS name, SUM(l.qty)::int AS "unitsSold", SUM(l.net) AS revenue
            FROM lines l
            JOIN "ProductVariant" v ON v.id = l."variantId"
            JOIN "Product" p ON p.id = v."productId"
            GROUP BY p.brand
            ORDER BY revenue DESC, name`
        : await this.prisma.$queryRaw<RevenueRow[]>`
            WITH ${netLines(range)}
            SELECT c.id AS "categoryId", c.name, SUM(l.qty)::int AS "unitsSold", SUM(l.net) AS revenue
            FROM lines l
            JOIN "ProductVariant" v ON v.id = l."variantId"
            JOIN "Product" p ON p.id = v."productId"
            JOIN "Category" c ON c.id = p."categoryId"
            GROUP BY c.id
            ORDER BY revenue DESC, c.name`;

    const totalRevenue = sum(rows.map((r) => r.revenue));
    return {
      ...range,
      by,
      totalRevenue: totalRevenue.toFixed(2),
      rows: rows.map((r) => ({
        categoryId: r.categoryId,
        name: r.name,
        unitsSold: r.unitsSold,
        revenue: money(r.revenue),
        sharePercent: percentOf(dec(r.revenue), totalRevenue),
      })),
    };
  }

  async staffPerformance(query: DateRangeQueryDto) {
    const range = resolveRange(query, last30Days);

    const rows = await this.prisma.$queryRaw<StaffRow[]>`
      WITH completed AS (
        SELECT
          o."cashierId",
          o.total,
          o.tax,
          (SELECT COALESCE(SUM(oi.qty), 0) FROM "OrderItem" oi WHERE oi."orderId" = o.id) AS units
        FROM "Order" o
        WHERE ${ordersIn(range)}
      ),
      voided AS (
        SELECT o."cashierId", COUNT(*)::int AS count
        FROM "Order" o
        WHERE ${ordersIn(range, 'voided')}
        GROUP BY o."cashierId"
      )
      SELECT
        u.id AS "userId",
        u.name,
        u.role::text AS role,
        COUNT(c."cashierId")::int AS orders,
        COALESCE(SUM(c.units), 0)::int AS "itemsSold",
        COALESCE(SUM(c.total - c.tax), 0) AS "netSales",
        COALESCE(SUM(c.total), 0) AS total,
        COALESCE(MAX(v.count), 0)::int AS "voidedOrders"
      FROM "User" u
      LEFT JOIN completed c ON c."cashierId" = u.id
      LEFT JOIN voided v ON v."cashierId" = u.id
      GROUP BY u.id
      ORDER BY "netSales" DESC, u.name`;

    return {
      ...range,
      staff: rows.map((r) => ({
        userId: r.userId,
        name: r.name,
        role: r.role,
        orders: r.orders,
        itemsSold: r.itemsSold,
        netSales: money(r.netSales),
        total: money(r.total),
        averageSale: r.orders ? dec(r.netSales).dividedBy(r.orders).toFixed(2) : null,
        voidedOrders: r.voidedOrders,
      })),
    };
  }

  async stockValuation() {
    const rows = await this.prisma.$queryRaw<StockRow[]>`
      SELECT
        c.id AS "categoryId",
        c.name,
        SUM(v."stockQty")::int AS units,
        SUM(v."stockQty" * p."costPrice") AS "costValue",
        SUM(v."stockQty" * v."sellPrice") AS "retailValue"
      FROM "ProductVariant" v
      JOIN "Product" p ON p.id = v."productId"
      JOIN "Category" c ON c.id = p."categoryId"
      GROUP BY c.id
      ORDER BY "costValue" DESC, c.name`;

    return {
      totalUnits: rows.reduce((n, r) => n + r.units, 0),
      costValue: sum(rows.map((r) => r.costValue)).toFixed(2),
      retailValue: sum(rows.map((r) => r.retailValue)).toFixed(2),
      byCategory: rows.map((r) => ({
        categoryId: r.categoryId,
        name: r.name,
        units: r.units,
        costValue: money(r.costValue),
        retailValue: money(r.retailValue),
      })),
    };
  }

  async profitMargin(query: DateRangeQueryDto) {
    const range = resolveRange(query, last30Days);

    const [row] = await this.prisma.$queryRaw<ProfitRow[]>`
      WITH ${netLines(range)}
      SELECT
        COALESCE(SUM(l.net), 0) AS "netSales",
        COALESCE(SUM(l.qty * p."costPrice"), 0) AS cost,
        COALESCE(SUM(l.qty), 0)::int AS "unitsSold"
      FROM lines l
      JOIN "ProductVariant" v ON v.id = l."variantId"
      JOIN "Product" p ON p.id = v."productId"`;

    const netSales = dec(row.netSales).toDecimalPlaces(2);
    const cost = dec(row.cost).toDecimalPlaces(2);
    const grossProfit = netSales.minus(cost);

    return {
      ...range,
      unitsSold: row.unitsSold,
      netSales: netSales.toFixed(2),
      cost: cost.toFixed(2),
      grossProfit: grossProfit.toFixed(2),
      marginPercent: percentOf(grossProfit, netSales),
    };
  }
}
