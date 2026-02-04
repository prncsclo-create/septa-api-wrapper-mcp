package handler

import (
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/mark3labs/mcp-go/server"
)

var mcpServer *server.MCPServer

func init() {
	mcpServer = server.NewServer(
		"SEPTA-MCP",
		"1.0.0",
	)

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
		route, ok := args["route"].(string)
		if !ok {
			return nil, fmt.Errorf("route is required")
		}
		url := fmt.Sprintf("https://api.septa.org/TransitView/index.php?route=%s", route)
		
		resp, err := http.Get(url)
		if err != nil {
			return nil, err
		}
		defer resp.Body.Close()

		var data interface{}
		if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
			return nil, err
		}
		
		jsonData, _ := json.Marshal(data)
		return &server.CallToolResult{
			Content: []server.Content{
				{Type: "text", Text: string(jsonData)},
			},
		}, nil
	})
}

func Handler(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodGet {
		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("Connection", "keep-alive")
		fmt.Fprintf(w, "event: endpoint\ndata: %s\n\n", r.URL.Path)
		return
	}
	mcpServer.ServeHTTP(w, r)
}
