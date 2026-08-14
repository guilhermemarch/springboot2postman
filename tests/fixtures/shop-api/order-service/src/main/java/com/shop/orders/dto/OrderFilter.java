package com.shop.orders.dto;

import java.time.LocalDate;

public class OrderFilter {
    private LocalDate createdAfter;
    private LocalDate createdBefore;
    private String customerEmail;
}
