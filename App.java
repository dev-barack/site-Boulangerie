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
        // Port 8080 par défaut
        int port = Integer.parseInt(System.getenv().getOrDefault("PORT", "8080"));
        HttpServer server = HttpServer.create(new InetSocketAddress(port), 0);

        StaticHandler staticHandler = new StaticHandler();
        ApiHandler apiHandler = new ApiHandler();

        // ROUTES STATIQUES (Dashboard & Ressources)
        server.createContext("/", staticHandler);
        server.createContext("/index", staticHandler);
        server.createContext("/styles.css", staticHandler);
        server.createContext("/script.js", staticHandler);
        server.createContext("/images/", staticHandler); // Traitement du dossier images

        // ROUTE API (Cohérence avec les données Android)
        server.createContext("/api/stats", apiHandler);

        server.setExecutor(null); 
        server.start();
        
        System.out.println("----------------------------------------------");
        System.out.println("🚀 BOULANGERIE D'ORÉE - SYSTÈME CONNECTÉ");
        System.out.println("🌍 Dashboard Admin : http://localhost:" + port);
        System.out.println("----------------------------------------------");
    }

    static class StaticHandler implements HttpHandler {
        private final Path baseDir = Paths.get("").toAbsolutePath().normalize();
        
        // Mappage simplifié pour le confort de navigation
        private final Map<String, String> routes = Map.of(
            "/", "/index.html",
            "/index", "/index.html"
        );

        @Override
        public void handle(HttpExchange exchange) throws IOException {
            String requestPath = exchange.getRequestURI().getPath();
            String filePath = routes.getOrDefault(requestPath, requestPath);

            // Sécurité et normalisation du chemin
            if (filePath.startsWith("/")) {
                filePath = filePath.substring(1);
            }
            if (filePath.isEmpty()) {
                filePath = "index.html";
            }

            Path target = baseDir.resolve(filePath).normalize();

            // Vérification de sécurité pour éviter de sortir du dossier racine
            if (!target.startsWith(baseDir)) {
                sendResponse(exchange, 403, "Accès refusé".getBytes(), "text/plain");
                return;
            }

            if (Files.exists(target) && Files.isRegularFile(target)) {
                byte[] data = Files.readAllBytes(target);
                String contentType = guessContentType(target.toString());
                sendResponse(exchange, 200, data, contentType);
            } else {
                System.err.println("Fichier non trouvé : " + target);
                sendResponse(exchange, 404, "Erreur : Page introuvable".getBytes(), "text/plain");
            }
        }

        private void sendResponse(HttpExchange exchange, int code, byte[] content, String contentType) throws IOException {
            exchange.getResponseHeaders().set("Content-Type", contentType);
            exchange.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
            exchange.sendResponseHeaders(code, content.length);
            try (OutputStream os = exchange.getResponseBody()) {
                os.write(content);
            }
        }

        private String guessContentType(String path) {
            String lower = path.toLowerCase();
            if (lower.endsWith(".html")) return "text/html; charset=utf-8";
            if (lower.endsWith(".css")) return "text/css; charset=utf-8";
            if (lower.endsWith(".js")) return "application/javascript; charset=utf-8";
            if (lower.endsWith(".png")) return "image/png";
            if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
            if (lower.endsWith(".svg")) return "image/svg+xml";
            return "application/octet-stream";
        }
    }

    static class ApiHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            // Données simulées cohérentes avec Firestore pour le premier chargement
            String jsonResponse = "{"
                + "\"status\": \"online\","
                + "\"currency\": \"FC\","
                + "\"caJour\": \"0 FC\","
                + "\"commandes\": 0,"
                + "\"stocks\": \"Synchronisé avec Firestore\""
                + "}";

            byte[] data = jsonResponse.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
            exchange.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
            exchange.sendResponseHeaders(200, data.length);
            try (OutputStream os = exchange.getResponseBody()) {
                os.write(data);
            }
        }
    }
}