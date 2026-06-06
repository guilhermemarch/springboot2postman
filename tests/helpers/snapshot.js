function getRequestPath(url) {
    if (!url) {
        return '/';
    }

    if (typeof url === 'string') {
        return url;
    }

    if (url.raw) {
        return url.raw;
    }

    if (url.path) {
        return `/${url.path.join('/')}`;
    }

    return '/';
}

function snapshotCollectionStructure(collection) {
    const folders = (collection.item || []).map((folder) => ({
        name: folder.name,
        requests: (folder.item || []).map((item) => ({
            name: item.name,
            method: item.request?.method,
            path: getRequestPath(item.request?.url),
            hasBody: Boolean(item.request?.body),
            responseCount: item.response?.length || 0,
        })),
    }));

    return {
        name: collection.info?.name,
        variables: (collection.variable || []).map((entry) => entry.key).sort(),
        folders,
        requestCount: folders.reduce((count, folder) => count + folder.requests.length, 0),
    };
}

module.exports = {
    snapshotCollectionStructure,
};
