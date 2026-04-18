import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";

const options: swaggerJsdoc.Options = {
    definition: {
        openapi: "3.0.0",
        info: {
            title: "Grabpic API",
            version: "1.0.0",
            description: "Intelligent Identity & Retrieval Engine",
        },
        servers: [{ url: "http://localhost:3000" }],
        paths: {
            "/admin/crawl": {
                post: {
                    summary: "Crawl sample-images and index all faces",
                    responses: {
                        "200": {
                            description: "Crawl completed successfully",
                            content: {
                                "application/json": {
                                    schema: {
                                        type: "object",
                                        properties: {
                                            totalImages: {
                                                type: "integer",
                                                example: 12,
                                            },
                                            totalFacesDetected: {
                                                type: "integer",
                                                example: 17,
                                            },
                                            newFacesAdded: {
                                                type: "integer",
                                                example: 14,
                                            },
                                            processingTime: {
                                                type: "number",
                                                example: 4.21,
                                            },
                                        },
                                        required: [
                                            "totalImages",
                                            "totalFacesDetected",
                                            "newFacesAdded",
                                            "processingTime",
                                        ],
                                    },
                                },
                            },
                        },
                    },
                },
            },
            "/auth/selfie": {
                post: {
                    summary: "Authenticate using a selfie image",
                    requestBody: {
                        required: true,
                        content: {
                            "multipart/form-data": {
                                schema: {
                                    type: "object",
                                    properties: {
                                        image: {
                                            type: "string",
                                            format: "binary",
                                        },
                                    },
                                    required: ["image"],
                                },
                            },
                        },
                    },
                    responses: {
                        "200": {
                            description: "Authentication successful",
                            content: {
                                "application/json": {
                                    schema: {
                                        type: "object",
                                        properties: {
                                            success: {
                                                type: "boolean",
                                                example: true,
                                            },
                                            grabId: {
                                                type: "string",
                                                format: "uuid",
                                                example:
                                                    "9c7d08ae-0a6f-4fc9-a35e-efcd03c9970f",
                                            },
                                            confidence: {
                                                type: "number",
                                                example: 0.91,
                                            },
                                        },
                                        required: [
                                            "success",
                                            "grabId",
                                            "confidence",
                                        ],
                                    },
                                },
                            },
                        },
                        "404": {
                            description: "No matching identity found",
                            content: {
                                "application/json": {
                                    schema: {
                                        type: "object",
                                        properties: {
                                            success: {
                                                type: "boolean",
                                                example: false,
                                            },
                                            error: {
                                                type: "string",
                                                example:
                                                    "No matching face found.",
                                            },
                                        },
                                        required: ["success", "error"],
                                    },
                                },
                            },
                        },
                    },
                },
            },
            "/images/{grabId}": {
                get: {
                    summary: "Get all images for a face",
                    parameters: [
                        {
                            name: "grabId",
                            in: "path",
                            required: true,
                            description: "Grab ID for the face",
                            schema: {
                                type: "string",
                                format: "uuid",
                            },
                        },
                    ],
                    responses: {
                        "200": {
                            description: "Images fetched successfully",
                            content: {
                                "application/json": {
                                    schema: {
                                        type: "object",
                                        properties: {
                                            grabId: {
                                                type: "string",
                                                format: "uuid",
                                                example:
                                                    "9c7d08ae-0a6f-4fc9-a35e-efcd03c9970f",
                                            },
                                            totalImages: {
                                                type: "integer",
                                                example: 3,
                                            },
                                            images: {
                                                type: "array",
                                                items: {
                                                    type: "string",
                                                    example:
                                                        "sample-images/user1/photo1.jpg",
                                                },
                                            },
                                        },
                                        required: [
                                            "grabId",
                                            "totalImages",
                                            "images",
                                        ],
                                    },
                                },
                            },
                        },
                        "404": {
                            description: "No images found for the given grabId",
                            content: {
                                "application/json": {
                                    schema: {
                                        type: "object",
                                        properties: {
                                            error: {
                                                type: "string",
                                                example:
                                                    "No images found for provided grabId.",
                                            },
                                        },
                                        required: ["error"],
                                    },
                                },
                            },
                        },
                    },
                },
            },
        },
    },
    apis: [],
};

const swaggerSpec = swaggerJsdoc(options);

export { swaggerUi, swaggerSpec };
