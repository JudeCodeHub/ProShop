import { Controller, Get, Param, ParseIntPipe, StreamableFile } from '@nestjs/common';
import { Roles } from '../../auth/roles.decorator.js';
import { Role } from '../../generated/prisma/client.js';
import { ReceiptsService } from './receipts.service.js';

@Controller('orders/:id/receipt')
@Roles(Role.cashier, Role.admin)
export class ReceiptsController {
  constructor(private readonly receiptsService: ReceiptsService) {}

  @Get()
  getReceipt(@Param('id', ParseIntPipe) id: number) {
    return this.receiptsService.getReceipt(id);
  }

  @Get('pdf')
  async getPdf(@Param('id', ParseIntPipe) id: number) {
    const { receipt, pdf } = await this.receiptsService.getPdf(id);
    return new StreamableFile(pdf, {
      type: 'application/pdf',
      disposition: `inline; filename="receipt-${receipt.receiptNumber}.pdf"`,
      length: pdf.length,
    });
  }
}
