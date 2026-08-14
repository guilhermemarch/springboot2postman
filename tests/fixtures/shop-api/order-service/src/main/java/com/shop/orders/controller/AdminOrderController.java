package com.shop.orders.controller;

import com.shop.orders.dto.OrderResponse;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/admin/orders")
public class AdminOrderController extends CrudController<OrderResponse, Long> {
}
