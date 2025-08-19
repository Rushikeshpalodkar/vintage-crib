const swaggerJSDoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const swaggerDefinition = {
    openapi: '3.0.0',
    info: {
        title: 'Vintage Crib API',
        version: '1.0.0',
        description: 'A curated vintage products marketplace API with eBay integration',
        contact: {
            name: 'Vintage Crib Team',
            url: 'https://vintage-crib.onrender.com',
            email: 'support@vintagecrib.com'
        },
        license: {
            name: 'MIT',
            url: 'https://opensource.org/licenses/MIT'
        }
    },
    servers: [
        {
            url: 'http://localhost:3001',
            description: 'Development server'
        },
        {
            url: 'https://vintage-crib.onrender.com',
            description: 'Production server'
        }
    ],
    components: {
        securitySchemes: {
            bearerAuth: {
                type: 'http',
                scheme: 'bearer',
                bearerFormat: 'JWT'
            }
        },
        schemas: {
            Product: {
                type: 'object',
                required: ['name', 'price', 'image'],
                properties: {
                    id: {
                        type: 'string',
                        description: 'Unique identifier for the product'
                    },
                    name: {
                        type: 'string',
                        maxLength: 500,
                        description: 'Product name'
                    },
                    price: {
                        type: 'number',
                        minimum: 0,
                        description: 'Product price in USD'
                    },
                    image: {
                        type: 'string',
                        description: 'URL or path to product image'
                    },
                    description: {
                        type: 'string',
                        maxLength: 2000,
                        description: 'Product description'
                    },
                    category: {
                        type: 'string',
                        description: 'Product category'
                    },
                    condition: {
                        type: 'string',
                        enum: ['New', 'Like New', 'Very Good', 'Good', 'Acceptable', 'Vintage', 'Used'],
                        description: 'Product condition'
                    },
                    sold: {
                        type: 'boolean',
                        description: 'Whether the product is sold'
                    },
                    featured: {
                        type: 'boolean',
                        description: 'Whether the product is featured'
                    },
                    ebayItemId: {
                        type: 'string',
                        description: 'eBay item ID'
                    },
                    ebayUrl: {
                        type: 'string',
                        description: 'eBay listing URL'
                    },
                    tags: {
                        type: 'array',
                        items: {
                            type: 'string'
                        },
                        description: 'Product tags'
                    },
                    vintage: {
                        type: 'object',
                        properties: {
                            era: {
                                type: 'string',
                                description: 'Vintage era'
                            },
                            year: {
                                type: 'number',
                                description: 'Year of production'
                            },
                            authenticity: {
                                type: 'string',
                                enum: ['Authenticated', 'Likely Authentic', 'Unknown', 'Reproduction'],
                                description: 'Authenticity status'
                            }
                        }
                    },
                    createdAt: {
                        type: 'string',
                        format: 'date-time',
                        description: 'Creation timestamp'
                    },
                    updatedAt: {
                        type: 'string',
                        format: 'date-time',
                        description: 'Last update timestamp'
                    }
                }
            },
            User: {
                type: 'object',
                properties: {
                    id: {
                        type: 'string',
                        description: 'User ID'
                    },
                    username: {
                        type: 'string',
                        description: 'Username'
                    },
                    role: {
                        type: 'string',
                        description: 'User role'
                    }
                }
            },
            AuthResponse: {
                type: 'object',
                properties: {
                    success: {
                        type: 'boolean',
                        description: 'Authentication success status'
                    },
                    token: {
                        type: 'string',
                        description: 'JWT access token'
                    },
                    user: {
                        $ref: '#/components/schemas/User'
                    },
                    message: {
                        type: 'string',
                        description: 'Response message'
                    }
                }
            },
            Error: {
                type: 'object',
                properties: {
                    success: {
                        type: 'boolean',
                        example: false
                    },
                    message: {
                        type: 'string',
                        description: 'Error message'
                    },
                    error: {
                        type: 'string',
                        description: 'Detailed error information'
                    }
                }
            }
        }
    },
    tags: [
        {
            name: 'Authentication',
            description: 'User authentication endpoints'
        },
        {
            name: 'Products',
            description: 'Product management endpoints'
        },
        {
            name: 'Admin',
            description: 'Administrative endpoints'
        },
        {
            name: 'eBay',
            description: 'eBay integration endpoints'
        },
        {
            name: 'Health',
            description: 'Health check and monitoring endpoints'
        }
    ]
};

const options = {
    swaggerDefinition,
    apis: [
        './server.js',
        './auth.js',
        './models/*.js'
    ]
};

const specs = swaggerJSDoc(options);

// Swagger UI options
const swaggerUIOptions = {
    explorer: true,
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'Vintage Crib API Documentation',
    customfavIcon: '/favicon.ico',
    swaggerOptions: {
        persistAuthorization: true,
        displayRequestDuration: true,
        filter: true,
        tryItOutEnabled: true
    }
};

module.exports = {
    specs,
    swaggerUi,
    swaggerUIOptions
};