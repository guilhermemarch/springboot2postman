package com.shop.orders.controller;

import com.shop.orders.dto.CreateOrderRequest;
import com.shop.orders.dto.OrderFilter;
import com.shop.orders.dto.OrderResponse;
import com.shop.orders.model.OrderStatus;
import jakarta.validation.Valid;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.UUID;

/**
 * Manages customer orders.
 */
@RestController
@RequestMapping(value = OrderController.BASE_PATH, produces = MediaType.APPLICATION_JSON_VALUE)
public class OrderController {

    public static final String BASE_PATH = "/api/v1/orders";

    /**
     * Lists orders with optional filtering and pagination.
     *
     * @param status filter by order status
     * @param filter additional filter criteria
     */
    @GetMapping
    public Page<OrderResponse> listOrders(
        @RequestParam(name = "status", required = false) OrderStatus status,
        @ModelAttribute OrderFilter filter,
        Pageable pageable
    ) {
        return Page.empty();
    }

    /**
     * Fetches a single order by its identifier.
     */
    @GetMapping(value = "/{orderId}")
    public ResponseEntity<OrderResponse> getOrder(@PathVariable("orderId") UUID orderId) {
        return ResponseEntity.ok(null);
    }

    @GetMapping({"/recent", "/latest"})
    public ResponseEntity<List<OrderResponse>> recentOrders(
        @RequestHeader(value = "X-Tenant-Id", required = false) String tenantId,
        @CookieValue(value = "session_hint", required = false) String sessionHint
    ) {
        return ResponseEntity.ok(List.of());
    }

    /**
     * Creates a new order.
     */
    @PostMapping(consumes = MediaType.APPLICATION_JSON_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    public OrderResponse createOrder(@Valid @RequestBody CreateOrderRequest request) {
        return null;
    }

    @RequestMapping(value = "/{orderId}/status", method = RequestMethod.PATCH)
    public ResponseEntity<OrderResponse> updateStatus(
        @PathVariable UUID orderId,
        @RequestParam OrderStatus status
    ) {
        return ResponseEntity.ok(null);
    }

    @PostMapping(value = "/{orderId}/attachments", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<Void> uploadAttachment(
        @PathVariable UUID orderId,
        @RequestPart("file") MultipartFile file,
        @RequestPart(value = "note", required = false) String note
    ) {
        return ResponseEntity.created(null).build();
    }

    @DeleteMapping("/{orderId}")
    public ResponseEntity<Void> cancelOrder(@PathVariable UUID orderId) {
        return ResponseEntity.noContent().build();
    }

    /**
     * Exports all orders as CSV.
     *
     * @deprecated use {@link #listOrders} instead
     */
    @Deprecated
    @GetMapping(value = "/export", produces = "text/csv")
    public String exportOrders(@RequestParam(defaultValue = "csv") String format) {
        return "";
    }
}
