const { parseJavaContent, interpretElementValueText } = require('../../core/parser/cst-extractor');

describe('cst-extractor', () => {
    describe('annotation attributes (v1 critical bug C1)', () => {
        test('extracts named value attribute from @RequestMapping', async () => {
            const model = await parseJavaContent(`
package com.example;

import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping(value = "/api/v1/users", produces = "application/json")
public class UserController {
}
`);
            const type = model.types[0];
            const mapping = type.annotations.find((a) => a.name === 'RequestMapping');
            expect(mapping.attributes.value).toBe('/api/v1/users');
            expect(mapping.attributes.produces).toBe('application/json');
        });

        test('extracts method attribute as ref', async () => {
            const model = await parseJavaContent(`
package com.example;

import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestMethod;

public class C {
    @RequestMapping(value = "/x", method = RequestMethod.POST)
    public void handle() {}
}
`);
            const method = model.types[0].methods[0];
            const mapping = method.annotations.find((a) => a.name === 'RequestMapping');
            expect(mapping.attributes.value).toBe('/x');
            expect(mapping.attributes.method).toEqual({ ref: 'RequestMethod.POST' });
        });

        test('expands array paths', async () => {
            const model = await parseJavaContent(`
package com.example;

import org.springframework.web.bind.annotation.GetMapping;

public class C {
    @GetMapping({"/recent", "/latest"})
    public void handle() {}
}
`);
            const annotation = model.types[0].methods[0].annotations[0];
            expect(annotation.attributes.value).toEqual(['/recent', '/latest']);
        });

        test('resolves same-file constants in annotation values', async () => {
            const model = await parseJavaContent(`
package com.example;

import org.springframework.web.bind.annotation.RequestMapping;

@RequestMapping(OrderController.BASE_PATH)
public class OrderController {
    public static final String BASE_PATH = "/api/v1/orders";
}
`);
            const annotation = model.types[0].annotations[0];
            expect(annotation.attributes.value).toBe('/api/v1/orders');
        });

        test('resolves well-known Spring MediaType constants', async () => {
            const model = await parseJavaContent(`
package com.example;

import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.PostMapping;

public class C {
    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public void upload() {}
}
`);
            const annotation = model.types[0].methods[0].annotations[0];
            expect(annotation.attributes.consumes).toBe('multipart/form-data');
        });

        test('boolean and numeric attributes are typed', async () => {
            const model = await parseJavaContent(`
package com.example;

import org.springframework.web.bind.annotation.RequestParam;

public class C {
    public void handle(@RequestParam(required = false, defaultValue = "10") Integer limit) {}
}
`);
            const param = model.types[0].methods[0].parameters[0];
            const annotation = param.annotations[0];
            expect(annotation.attributes.required).toBe(false);
            expect(annotation.attributes.defaultValue).toBe('10');
        });
    });

    describe('type declarations (v1 critical bug C3)', () => {
        test('extracts records with components and annotations', async () => {
            const model = await parseJavaContent(`
package com.example;

import jakarta.validation.constraints.NotNull;
import java.util.UUID;

public record CreateOrderRequest(@NotNull UUID customerId, String note) {}
`);
            const record = model.types[0];
            expect(record.kind).toBe('record');
            expect(record.simpleName).toBe('CreateOrderRequest');
            expect(record.fields).toHaveLength(2);
            expect(record.fields[0].name).toBe('customerId');
            expect(record.fields[0].type).toBe('UUID');
            expect(record.fields[0].annotations[0].name).toBe('NotNull');
        });

        test('extracts interfaces with annotated methods', async () => {
            const model = await parseJavaContent(`
package com.example;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;

@RequestMapping("/api/products")
public interface ProductApi {
    @GetMapping("/{id}")
    String getProduct(Long id);
}
`);
            const iface = model.types[0];
            expect(iface.kind).toBe('interface');
            expect(iface.annotations[0].name).toBe('RequestMapping');
            expect(iface.methods).toHaveLength(1);
            expect(iface.methods[0].annotations[0].name).toBe('GetMapping');
        });

        test('extracts enums with constants', async () => {
            const model = await parseJavaContent(`
package com.example;

public enum OrderStatus { PENDING, PAID, SHIPPED }
`);
            const enumType = model.types[0];
            expect(enumType.kind).toBe('enum');
            expect(enumType.enumConstants).toEqual(['PENDING', 'PAID', 'SHIPPED']);
        });

        test('extracts superclass and interfaces with generics', async () => {
            const model = await parseJavaContent(`
package com.example;

public class AdminController extends CrudController<OrderResponse, Long> implements Marker {
}
`);
            const type = model.types[0];
            expect(type.superclass).toBe('CrudController<OrderResponse,Long>');
            expect(type.interfaces).toEqual(['Marker']);
        });

        test('extracts nested types with qualified names', async () => {
            const model = await parseJavaContent(`
package com.example;

public class Outer {
    private String name;

    public static class Inner {
        private int value;
    }
}
`);
            expect(model.types.map((t) => t.name)).toEqual(['Outer', 'Outer.Inner']);
            expect(model.types[0].fields).toHaveLength(1);
            expect(model.types[1].fields[0].name).toBe('value');
        });
    });

    describe('fields', () => {
        test('keeps nested generics intact (v1 bug H2)', async () => {
            const model = await parseJavaContent(`
package com.example;

import java.util.List;
import java.util.Map;

public class Dto {
    private Map<String, List<String>> metadata;
    private List<Map<String, Object>> rows;
}
`);
            const fields = model.types[0].fields;
            expect(fields[0].type).toBe('Map<String,List<String>>');
            expect(fields[1].type).toBe('List<Map<String,Object>>');
        });

        test('marks static and transient fields', async () => {
            const model = await parseJavaContent(`
package com.example;

public class Dto {
    private static final String CONSTANT = "x";
    private transient String cache;
    private String real;
}
`);
            const fields = model.types[0].fields;
            expect(fields.find((f) => f.name === 'CONSTANT').isStatic).toBe(true);
            expect(fields.find((f) => f.name === 'cache').isTransient).toBe(true);
            expect(fields.find((f) => f.name === 'real').isStatic).toBe(false);
        });
    });

    describe('methods', () => {
        test('extracts return type, params and body text', async () => {
            const model = await parseJavaContent(`
package com.example;

import org.springframework.http.ResponseEntity;
import java.util.List;

public class C {
    public ResponseEntity<List<User>> list(String query) {
        return ResponseEntity.ok(null);
    }
}
`);
            const method = model.types[0].methods[0];
            expect(method.returnType).toBe('ResponseEntity<List<User>>');
            expect(method.parameters[0]).toMatchObject({ name: 'query', type: 'String' });
            expect(method.bodyText).toContain('ResponseEntity.ok');
        });

        test('extracts javadoc summary, params and deprecation', async () => {
            const model = await parseJavaContent(`
package com.example;

public class C {
    /**
     * Lists orders with optional filtering.
     *
     * More details here.
     *
     * @param status filter by order status
     * @deprecated use listOrders instead
     */
    public String list(String status) {
        return "";
    }
}
`);
            const javadoc = model.types[0].methods[0].javadoc;
            expect(javadoc.summary).toBe('Lists orders with optional filtering.');
            expect(javadoc.params.status).toBe('filter by order status');
            expect(javadoc.deprecated).toBe(true);
        });
    });

    describe('imports and package', () => {
        test('extracts package, plain, static and wildcard imports', async () => {
            const model = await parseJavaContent(`
package com.example.api;

import java.util.List;
import static com.example.Constants.BASE;
import com.example.dto.*;

public class C {}
`);
            expect(model.packageName).toBe('com.example.api');
            expect(model.imports).toEqual([
                { fqn: 'java.util.List', simpleName: 'List', isStatic: false, isWildcard: false },
                {
                    fqn: 'com.example.Constants.BASE',
                    simpleName: 'BASE',
                    isStatic: true,
                    isWildcard: false,
                },
                { fqn: 'com.example.dto', simpleName: null, isStatic: false, isWildcard: true },
            ]);
        });
    });

    describe('interpretElementValueText', () => {
        test('string concatenation with constants', () => {
            expect(interpretElementValueText('BASE + "/items"', { BASE: '/api' })).toBe(
                '/api/items',
            );
        });

        test('unresolvable references become refs', () => {
            expect(interpretElementValueText('SomeClass.UNKNOWN', {})).toEqual({
                ref: 'SomeClass.UNKNOWN',
            });
        });
    });
});
