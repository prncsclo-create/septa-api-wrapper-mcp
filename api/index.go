package handler

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"

	"github.com/mark3labs/mcp-go/server"
)

var mcpServer *server.MCPServer

func init() {
	// Initialize the MCP Server with your SEPTA details
	mcpServer = server.NewServer(
		"SEPTA-MCP",
		"1.0.0",
		server.WithLogging(),
	)

	// Register the "get_bus_locations" tool
	mcpServer.AddTool(server.Tool{
		Name:        "get_bus_locations",
		Description: "Get real-time locations for all vehicles on a specific SEPTA route.",
		Parameters: map[string]interface{}{
			"type": "object",
			"properties": map[string]interface{}{
				"route": map[string]interface{}{
					"type":        "string",
					"description": "Route number (e.g., '23', '45')",
				},
			},
			"required": []string{"route"},
		},
	}, func(args map[string]interface{}) (*server.CallToolResult, error) {
		route := args["route"].(string)
		url := fmt.Sprintf("https://api.septa.org/TransitView/index.php?route=%s", route)
		
		resp, err := http.Get(url)
		if err != nil {
			return nil, err
		}
		defer resp.Body.Close()

		var data interface{}
		json.NewDecoder(resp.Body).Decode(&data)
		
		jsonData, _ := json.Marshal(data)
		return &server.CallToolResult{
			Content: []server.Content{
				{Type: "text", Text: string(jsonData)},
			},
		}, nil
	})
}

// Handler is the Vercel entry point
func Handler(w http.ResponseWriter, r *http.Request) {
	// 1. Handle GET request (SSE Stream)
	if r.Method == http.MethodGet {
		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("Connection", "keep-alive")
		
		// The SSE transport needs to stay open
		// In a simple Vercel function, we just acknowledge the endpoint is ready
		fmt.Fprintf(w, "event: endpoint\ndata: %s\n\n", "/api/index")
		return
	}

	// 2. Handle POST request (MCP Messages)
	if r.Method == http.MethodPost {
		mcpServer.ServeHTTP(w, r)
		return
	}

	w.WriteHeader(http.StatusMethodNotAllowed)
}
