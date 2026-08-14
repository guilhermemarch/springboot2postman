package com.shop.orders.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;
import java.util.UUID;

public record CreateOrderRequest(
    @NotNull UUID customerId,
    @NotBlank @Size(max = 140) String note,
    @NotNull @Size(min = 1) List<OrderItemRequest> items,
    @Min(0) @Max(100) Integer discountPercent
) {}
