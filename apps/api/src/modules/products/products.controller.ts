import { Controller, Get, Inject, Param, Query, Req, UseGuards } from '@nestjs/common';
import type { NotificationView, PricePointView, ProductView } from '@xianyu/contracts';
import { AccessTokenGuard, type AuthenticatedRequest } from '../auth/access-token.guard';
import { ProductsService } from './products.service';

/**
 * 商品/价格历史/通知查询接口（API-004，需登录）
 * GET /api/products?keyword=&page=；GET /api/products/:id；GET /api/products/:id/prices；
 * GET /api/notifications
 */

@Controller()
@UseGuards(AccessTokenGuard)
export class ProductsController {
  constructor(@Inject(ProductsService) private readonly products: ProductsService) {}

  @Get('products')
  async list(
    @Query('keyword') keyword = '',
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
  ) {
    return this.products.list(keyword, Number(page), Number(pageSize));
  }

  @Get('products/:id')
  async get(@Param('id') id: string): Promise<ProductView> {
    return this.products.get(id);
  }

  @Get('products/:id/prices')
  async prices(@Param('id') id: string): Promise<PricePointView[]> {
    return this.products.prices(id);
  }

  @Get('notifications')
  async notifications(
    @Req() request: AuthenticatedRequest,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
  ) {
    return this.products.notifications(request.userId ?? '', Number(page), Number(pageSize));
  }
}
