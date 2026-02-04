package handler

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"

	"github.com/mark3labs/mcp-go/server"
)

var mcpServer *server.MCPServer

func init() {
	mcpServer = server.NewServer(
		"SEPTA Transit MCP",
		"1.0.0",
	)

	// Tool 1: Get Bus Locations
	mcpServer.AddTool(server.Tool{
		Name:        "get_bus_locations",
		Description: "Get real-time locations for all vehicles on a specific SEPTA route (bus or trolley).",
		Parameters: map[string]interface{}{
			"type": "object",
			"properties": map[string]interface{}{
				"route": map[string]interface{}{
					"type":        "string",
					"description": "The route number (e.g., '23', '45', 'G')",
				},
			},
			"required": []string{"route"},
		},
	}, func(args map[string]interface{}) (*server.CallToolResult, error) {
		route, ok := args["route"].(string)
		if !ok || route == "" {
			return nil, fmt.Errorf("route parameter is required and must be a string")
		}

		// Use correct SEPTA endpoint
		apiURL := fmt.Sprintf("https://www3.septa.org/TransitView/index.php?route=%s", url.QueryEscape(route))

		resp, err := http.Get(apiURL)
		if err != nil {
			return nil, fmt.Errorf("failed to fetch bus locations: %w", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			return nil, fmt.Errorf("SEPTA API returned status code: %d", resp.StatusCode)
		}

		var data interface{}
		if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
			return nil, fmt.Errorf("failed to decode response: %w", err)
		}

		jsonData, err := json.MarshalIndent(data, "", "  ")
		if err != nil {
			return nil, fmt.Errorf("failed to marshal response: %w", err)
		}

		return &server.CallToolResult{
			Content: []server.Content{
				{Type: "text", Text: string(jsonData)},
			},
		}, nil
	})

	// Tool 2: Get Bus Detours
	mcpServer.AddTool(server.Tool{
		Name:        "get_bus_detours",
		Description: "Check for active detours on a specific SEPTA route.",
		Parameters: map[string]interface{}{
			"type": "object",
			"properties": map[string]interface{}{
				"route": map[string]interface{}{
					"type":        "string",
					"description": "The route number to check for detours (e.g., '23', '45')",
				},
			},
			"required": []string{"route"},
		},
	}, func(args map[string]interface{}) (*server.CallToolResult, error) {
		route, ok := args["route"].(string)
		if !ok || route == "" {
			return nil, fmt.Errorf("route parameter is required and must be a string")
		}

		apiURL := fmt.Sprintf("https://www3.septa.org/api/BusDetours/index.php?route=%s", url.QueryEscape(route))

		resp, err := http.Get(apiURL)
		if err != nil {
			return nil, fmt.Errorf("failed to fetch bus detours: %w", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			return nil, fmt.Errorf("SEPTA API returned status code: %d", resp.StatusCode)
		}

		var data interface{}
		if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
			return nil, fmt.Errorf("failed to decode response: %w", err)
		}

		jsonData, err := json.MarshalIndent(data, "", "  ")
		if err != nil {
			return nil, fmt.Errorf("failed to marshal response: %w", err)
		}

		return &server.CallToolResult{
			Content: []server.Content{
				{Type: "text", Text: string(jsonData)},
			},
		}, nil
	})

	// Tool 3: Get Transit Alerts
	mcpServer.AddTool(server.Tool{
		Name:        "get_transit_alerts",
		Description: "Get general system alerts and advisories for SEPTA services.",
		Parameters: map[string]interface{}{
			"type":       "object",
			"properties": map[string]interface{}{},
		},
	}, func(args map[string]interface{}) (*server.CallToolResult, error) {
		apiURL := "https://www3.septa.org/api/Alerts/index.php"

		resp, err := http.Get(apiURL)
		if err != nil {
			return nil, fmt.Errorf("failed to fetch transit alerts: %w", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			return nil, fmt.Errorf("SEPTA API returned status code: %d", resp.StatusCode)
		}

		var data interface{}
		if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
			return nil, fmt.Errorf("failed to decode response: %w", err)
		}

		jsonData, err := json.MarshalIndent(data, "", "  ")
		if err != nil {
			return nil, fmt.Errorf("failed to marshal response: %w", err)
		}

		return &server.CallToolResult{
			Content: []server.Content{
				{Type: "text", Text: string(jsonData)},
			},
		}, nil
	})
}

// Handler is the Vercel serverless function entry point
func Handler(w http.ResponseWriter, r *http.Request) {
	// Handle preflight CORS requests
	if r.Method == http.MethodOptions {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		w.WriteHeader(http.StatusOK)
		return
	}

	// Enable CORS
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

	// Handle GET requests for endpoint discovery
	if r.Method == http.MethodGet {
		w.Header().Set("Content-Type", "application/json")
		response := map[string]interface{}{
			"name":    "SEPTA Transit MCP",
			"version": "1.0.0",
			"status":  "active",
			"tools": []string{
				"get_bus_locations",
				"get_bus_detours",
				"get_transit_alerts",
			},
		}
		json.NewEncoder(w).Encode(response)
		return
	}

	// Handle POST requests through MCP server
	mcpServer.ServeHTTP(w, r)
}
