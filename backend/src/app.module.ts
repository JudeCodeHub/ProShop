import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthController } from './health/health.controller.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { AuthModule } from './auth/auth.module.js';
import { ProductsModule } from './products/products.module.js';
import { VariantsModule } from './variants/variants.module.js';
import { CategoriesModule } from './categories/categories.module.js';
import { InventoryModule } from './inventory/inventory.module.js';
import { OrdersModule } from './orders/orders.module.js';
import { ReportsModule } from './reports/reports.module.js';
import { SuppliersModule } from './suppliers/suppliers.module.js';
import { PurchaseOrdersModule } from './purchase-orders/purchase-orders.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    ProductsModule,
    VariantsModule,
    CategoriesModule,
    InventoryModule,
    OrdersModule,
    ReportsModule,
    SuppliersModule,
    PurchaseOrdersModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
