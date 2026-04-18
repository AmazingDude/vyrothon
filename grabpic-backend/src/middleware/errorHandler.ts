import { NextFunction, Request, Response } from "express";

export interface AppError extends Error {
    statusCode: number;
}

export function errorHandler(
    err: Error | AppError,
    req: Request,
    res: Response,
    _next: NextFunction,
): void {
    const statusCode =
        "statusCode" in err && typeof err.statusCode === "number"
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

export function notFoundHandler(
    req: Request,
    res: Response,
    _next: NextFunction,
): void {
    console.warn("[404]", {
        method: req.method,
        path: req.originalUrl,
    });

    res.status(404).json({
        success: false,
        error: "Route not found",
    });
}
