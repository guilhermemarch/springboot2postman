package com.shop.orders;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class TestSupportController {

    @GetMapping("/test-only")
    public String testOnly() {
        return "test";
    }
}
