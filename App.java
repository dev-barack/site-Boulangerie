import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Map;

public class App {
    public static void main(String[] args) throws Exception {
        int port = Integer.parseInt(System.getenv().getOrDefault("PORT", "8080"));
        HttpServer server = HttpServer.create(new InetSocketAddress(port), 0);

        server.createContext("/", new StaticHandler());
        server.createContext("/dashboard", new StaticHandler());
        server.createContext("/styles.css", new StaticHandler());
        server.createContext("/script.js", new StaticHandler());
        server.createContext("/images", new StaticHandler());

        server.setExecutor(null);
        server.start();
        System.out.println("Serveur lancé sur http://localhost:" + port);
    }

    static class StaticHandler implements HttpHandler {
        private final Path baseDir = Paths.get("").toAbsolutePath();
        private final Map<String, String> routes = Map.of(
            "/", "/index.html",
            "/dashboard", "/dashboard.html"
        );

        @Override
        public void handle(HttpExchange exchange) throws IOException {
            String requestPath = exchange.getRequestURI().getPath();
            String filePath = routes.getOrDefault(requestPath, requestPath);

            if (filePath.equals("/")) {
                filePath = "/index.html";
            }

            if (filePath.startsWith("/images")) {
                Path target = baseDir.resolve(filePath.substring(1)).normalize();
                if (Files.exists(target) && Files.isRegularFile(target)) {
                    sendFile(exchange, target, guessContentType(filePath));
                    return;
                }
            }

            Path target = baseDir.resolve(filePath.substring(1)).normalize();
            if (!target.startsWith(baseDir)) {
                sendText(exchange, 403, "Accès refusé");
                return;
            }

            if (Files.exists(target) && Files.isRegularFile(target)) {
                sendFile(exchange, target, guessContentType(filePath));
            } else {
                sendText(exchange, 404, "Page introuvable");
            }
        }

        private void sendFile(HttpExchange exchange, Path path, String contentType) throws IOException {
            byte[] data = Files.readAllBytes(path);
            exchange.getResponseHeaders().set("Content-Type", contentType);
            exchange.sendResponseHeaders(200, data.length);
            try (OutputStream os = exchange.getResponseBody()) {
                os.write(data);
            }
        }

        private void sendText(HttpExchange exchange, int statusCode, String text) throws IOException {
            byte[] data = text.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "text/plain; charset=utf-8");
            exchange.sendResponseHeaders(statusCode, data.length);
            try (OutputStream os = exchange.getResponseBody()) {
                os.write(data);
            }
        }

        private String guessContentType(String path) {
            if (path.endsWith(".html")) return "text/html; charset=utf-8";
            if (path.endsWith(".css")) return "text/css; charset=utf-8";
            if (path.endsWith(".js")) return "application/javascript; charset=utf-8";
            if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
            if (path.endsWith(".png")) return "image/png";
            return "application/octet-stream";
        }
    }
}
