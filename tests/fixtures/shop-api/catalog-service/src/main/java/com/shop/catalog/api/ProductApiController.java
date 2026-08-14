package com.shop.catalog.api;

import com.shop.catalog.dto.ProductDTO;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
public class ProductApiController implements ProductApi {

    @Override
    public ResponseEntity<List<ProductDTO>> listProducts(String query) {
        return ResponseEntity.ok(List.of());
    }

    @Override
    public ResponseEntity<ProductDTO> getProduct(Long id) {
        return ResponseEntity.ok(null);
    }

    @Override
    public ResponseEntity<ProductDTO> createProduct(ProductDTO product) {
        return ResponseEntity.ok(null);
    }
}
