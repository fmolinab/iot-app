module.exports = {
    uiPort: process.env.PORT || 1880,

    // Disable public Node-RED editor in deployment.
    // The runtime WebSocket/HTTP endpoints still work.
    httpAdminRoot: "/nr",
    httpNodeRoot: "/",

    functionGlobalContext: {},

    logging: {
        console: {
            level: "info",
            audit: false
        }
    }
};