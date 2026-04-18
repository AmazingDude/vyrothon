"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = errorHandler;
exports.notFoundHandler = notFoundHandler;
function errorHandler(err, req, res, _next) {
    const statusCode = "statusCode" in err && typeof err.statusCode === "number"
        ? err.statusCode
        : 500;
    const message = err.message || "Internal server error";
    console.error("[Error]", {
        method: req.method,
        path: req.originalUrl,
        statusCode,
        name: err.name,
        message,
        stack: err.stack,
    });
    res.status(statusCode).json({
        success: false,
        error: message,
        ...(process.env["NODE_ENV"] !== "production" && { stack: err.stack }),
    });
}
function notFoundHandler(req, res, _next) {
    console.warn("[404]", {
        method: req.method,
        path: req.originalUrl,
    });
    res.status(404).json({
        success: false,
        error: "Route not found",
    });
}
