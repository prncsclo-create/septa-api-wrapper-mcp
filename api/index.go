package handler

import (
	"net/http"
	// Import the logic from the root package if necessary, 
    // or paste the core wrapping logic here.
)

func Handler(w http.ResponseWriter, r *http.Request) {
    // This function acts as the "Server" for Vercel
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"status": "SEPTA MCP Server is running"}`))
}
