function getRequestPath(url) {
    if (!url) {
        return '/';
    }

    if (typeof url === 'string') {
        return url;
    }

    if (url.path) {
        return `/${url.path.join('/')}`;
    }

    if (url.raw) {
        return url.raw;
    }

    return '/';
}

function snapshotItems(items = []) {
    return items.map((item) => {
        if (item.item) {
            return {
                folder: item.name,
                items: snapshotItems(item.item),
            };
        }
        return {
            name: item.name,
            method: item.request?.method,
            path: getRequestPath(item.request?.url),
            hasBody: Boolean(item.request?.body),
            responses: (item.response || []).map((r) => `${r.code} ${r.name}`).sort(),
        };
    });
}

function snapshotCollectionStructure(collection) {
    const items = snapshotItems(collection.item);

    const countRequests = (nodes) =>
        nodes.reduce(
            (count, node) =>
                node.items ? count + countRequests(node.items) : count + 1,
            0,
        );

    return {
        name: collection.info?.name,
        auth: collection.auth?.type || null,
        variables: (collection.variable || []).map((entry) => entry.key).sort(),
        items,
        requestCount: countRequests(items),
    };
}

module.exports = {
    snapshotCollectionStructure,
};
