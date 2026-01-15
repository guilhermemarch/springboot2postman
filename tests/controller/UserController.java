package com.example.api.controller;

import org.springframework.web.bind.annotation.*;
import org.springframework.http.ResponseEntity;

@RestController
@RequestMapping("/api/users")
public class UserController {
    
    @GetMapping("/{id}")
    public ResponseEntity<User> getUser(@PathVariable Long id) {
        return ResponseEntity.ok(new User());
    }
    
    @GetMapping
    public ResponseEntity<List<User>> getAllUsers(
        @RequestParam(required = false) String search,
        @RequestParam(defaultValue = "10") Integer limit
    ) {
        return ResponseEntity.ok(new ArrayList<>());
    }
    
    @PostMapping
    public ResponseEntity<User> createUser(@RequestBody UserDTO userDto) {
        return ResponseEntity.ok(new User());
    }
    
    @PutMapping("/{id}")
    public ResponseEntity<User> updateUser(
        @PathVariable Long id,
        @RequestBody UserDTO userDto
    ) {
        return ResponseEntity.ok(new User());
    }
    
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteUser(@PathVariable Long id) {
        return ResponseEntity.noContent().build();
    }
}