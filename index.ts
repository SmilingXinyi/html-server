import {serve} from 'bun';
import {readFileSync, existsSync} from 'fs';
import pino from 'pino';
import {join} from 'path';

// 1. Initialize structured Logger, output JSON, no Pretty printing
const logger = pino({
    level: 'info',
    transport: {
        target: 'pino-pretty',
        options: {
            colorize: true
        }
    },
    timestamp: pino.stdTimeFunctions.isoTime
});

// Define constants
const HTML_DIR = './html';
const CONFIG_DIR = './conf';
const DEFAULT_404_PAGE = '404.html';
const STATIC_FILE_EXTENSIONS = ['.html', '.htm'];

// 2. Read routing configuration
const configFilePath = join(CONFIG_DIR, 'routes.json');
let routeMap = new Map<string, string>();

if (existsSync(configFilePath)) {
    try {
        const configText = readFileSync(configFilePath, 'utf-8');
        const routes = JSON.parse(configText);

        // Add routes from the configuration file to the map
        for (const [path, file] of Object.entries(routes)) {
            routeMap.set(path, join(HTML_DIR, file as string));
        }
    } catch (err: any) {
        logger.error({event: 'config_parse_error', error: err.message}, 'Failed to parse configuration file');
    }
}

// 4. Start the server
const PORT = 3000;
logger.info({event: 'server_start', port: PORT}, 'Service started and listening');

serve({
    port: PORT,
    async fetch(request) {
        const url = new URL(request.url);
        const route = url.pathname;
        const method = request.method;

        // Check if it is an HTML request
        const isHtmlRequest =
            // If the path has no extension, assume it is an HTML request
            !route.includes('.') ||
            // Or if the extension is HTML
            STATIC_FILE_EXTENSIONS.some(ext => route.toLowerCase().endsWith(ext));

        // Ignore non-HTML requests
        if (!isHtmlRequest) {
            return new Response('Not Found', {status: 404});
        }

        // Log HTML request
        logger.info({event: 'html_request', route}, `HTML request: ${route}`);

        try {
            let filePath: string;
            let isNotFound = false;

            // Check if the route exists in the route map
            if (routeMap.has(route)) {
                filePath = routeMap.get(route)!;

                // Check if the mapped file exists
                if (!existsSync(filePath)) {
                    isNotFound = true;
                    logger.error(
                        {event: 'file_not_found', route, file: filePath},
                        `Mapped file does not exist: ${filePath}`
                    );
                }
            } else {
                // Auto-mapping: map the route path to the corresponding HTML file
                // Handle the special case for the root path
                // Remove the leading /
                const htmlFile = route === '/' ? 'index.html' : `${route.substring(1)}.html`;

                filePath = join(HTML_DIR, htmlFile);

                // Check if the file exists
                if (!existsSync(filePath)) {
                    isNotFound = true;
                    logger.error({event: 'file_not_found', route, file: filePath}, `File not found: ${filePath}`);
                }
            }

            // If the file does not exist, try using the 404 page
            if (isNotFound) {
                const notFoundPath = join(HTML_DIR, DEFAULT_404_PAGE);

                if (existsSync(notFoundPath)) {
                    filePath = notFoundPath;
                    return new Response(await Bun.file(filePath).text(), {
                        status: 404,
                        headers: new Headers({
                            'Content-Type': 'text/html; charset=utf-8',
                            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0'
                        })
                    });
                } else {
                    // If the 404 page also does not exist, return plain text 404
                    return new Response('404 Not Found', {status: 404});
                }
            }

            // Read and return the HTML file content
            const html = await Bun.file(filePath).text();
            const headers = new Headers({
                'Content-Type': 'text/html; charset=utf-8',
                'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0'
            });

            return new Response(html, {status: 200, headers});
        } catch (err: any) {
            logger.error(
                {
                    event: 'server_error',
                    route,
                    error: err.message
                },
                'Server error processing request'
            );
            return new Response('500 Internal Server Error', {status: 500});
        }
    }
});
