function countEndpoints(collection) {
    let count = 0;

    function countInFolder(items) {
        for (const item of items) {
            if (item.item) {
                countInFolder(item.item);
            } else if (item.request) {
                count++;
            }
        }
    }

    if (collection.item) {
        countInFolder(collection.item);
    }

    return count;
}

function countOpenApiEndpoints(spec) {
    if (!spec.paths) {
        return 0;
    }

    let count = 0;
    for (const pathItem of Object.values(spec.paths)) {
        count += ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'].filter(
            (method) => pathItem[method],
        ).length;
    }
    return count;
}

module.exports = {
    countEndpoints,
    countOpenApiEndpoints,
};
