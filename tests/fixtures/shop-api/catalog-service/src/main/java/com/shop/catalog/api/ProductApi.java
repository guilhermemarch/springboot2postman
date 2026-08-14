package com.shop.catalog.api;

import com.shop.catalog.dto.ProductDTO;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;

import java.util.List;

@RequestMapping("/api/products")
public interface ProductApi {

    @GetMapping
    ResponseEntity<List<ProductDTO>> listProducts(@RequestParam(required = false) String query);

    @GetMapping("/{id}")
    ResponseEntity<ProductDTO> getProduct(@PathVariable Long id);

    @PostMapping
    ResponseEntity<ProductDTO> createProduct(@RequestBody ProductDTO product);
}
