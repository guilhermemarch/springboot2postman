package com.shop.orders.dto;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.shop.orders.model.OrderStatus;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

public class OrderResponse {

    private UUID id;

    @JsonProperty("order_number")
    private String orderNumber;

    private OrderStatus status;

    private CustomerSummary customer;

    private List<OrderItem> items;

    private Map<String, List<String>> metadata;

    private BigDecimal total;

    private Instant createdAt;

    @JsonIgnore
    private String internalNotes;
}
