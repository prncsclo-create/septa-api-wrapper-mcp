# SEPTA Transit MCP Server

A Model Context Protocol (MCP) server providing real-time access to SEPTA (Southeastern Pennsylvania Transportation Authority) transit data for buses and trolleys in Philadelphia.

## Features

This MCP server provides three tools for accessing SEPTA transit information:

### 1. **get_bus_locations**
Get real-time locations for all vehicles on a specific SEPTA route.

**Parameters:**
- `route` (string, required): The route number (e.g., '23', '45', 'G')

**Example:**
```json
{
  "route": "23"
}
```

### 2. **get_bus_detours**
Check for active detours on a specific SEPTA route.

**Parameters:**
- `route` (string, required): The route number to check for detours

**Example:**
```json
{
  "route": "45"
}
```

### 3. **get_transit_alerts**
Get general system alerts and advisories for SEPTA services.

**Parameters:** None

## Deployment

This server is designed to run as a Vercel serverless function.

### Prerequisites
- Vercel account
- GitHub repository connected to Vercel

### Deploy to Vercel

1. **Connect Repository:**
   - Go to [Vercel Dashboard](https://vercel.com/dashboard)
   - Click "New Project"
   - Import this GitHub repository

2. **Configure Project:**
   - Framework Preset: Other
   - Build Command: (leave empty)
   - Output Directory: (leave empty)
   - Install Command: (leave empty)

3. **Deploy:**
   - Click "Deploy"
   - Vercel will automatically detect the Go runtime and deploy your function

### Testing

Once deployed, you can test the endpoint:

**GET request (health check):**
```bash
curl https://your-deployment.vercel.app/
```

**POST request (MCP tool call):**
```bash
curl -X POST https://your-deployment.vercel.app/ \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "get_bus_locations",
      "arguments": {
        "route": "23"
      }
    },
    "id": 1
  }'
```

## Project Structure

```
septa-api-wrapper-mcp/
├── api/
│   └── index.go          # Main serverless function handler
├── go.mod                # Go module definition
├── go.sum                # Go dependencies checksums
├── mcp-config.yaml       # MCP tool configuration (reference)
├── vercel.json           # Vercel deployment configuration
└── README.md             # This file
```

## Configuration Files

### go.mod
Defines the Go module and dependencies:
- `github.com/mark3labs/mcp-go v0.8.2` - MCP server library

### vercel.json
Configures Vercel deployment:
- Specifies Go runtime
- Routes all requests to the serverless function

### mcp-config.yaml
Reference configuration for the MCP tools (used for documentation).

## API Endpoints Used

This server proxies requests to the following SEPTA APIs:

- **TransitView API**: `https://www3.septa.org/TransitView/index.php`
  - Real-time vehicle locations
  
- **Bus Detours API**: `https://www3.septa.org/api/BusDetours/index.php`
  - Active detour information
  
- **Alerts API**: `https://www3.septa.org/api/Alerts/index.php`
  - System-wide alerts and advisories

## Error Handling

The server includes comprehensive error handling:
- Parameter validation
- HTTP status code checking
- JSON parsing error detection
- Detailed error messages in responses

## CORS Support

The server includes CORS headers to allow browser-based clients to access the API.

## Development

### Local Testing

To test locally, you can use the Vercel CLI:

```bash
# Install Vercel CLI
npm i -g vercel

# Run locally
vercel dev
```

### Making Changes

1. Update `api/index.go` for functionality changes
2. Update `mcp-config.yaml` for configuration reference
3. Test locally with `vercel dev`
4. Commit and push to trigger automatic deployment

## Troubleshooting

### Deployment Issues
- Ensure `go.mod` specifies Go 1.22
- Check Vercel build logs for compilation errors
- Verify all dependencies are properly listed in `go.mod`

### API Issues
- SEPTA APIs may occasionally be unavailable
- Some routes may not return data if no vehicles are active
- Check SEPTA's official status page for service disruptions

## License

This project is open source and available under the MIT License.

## Resources

- [SEPTA Developer Resources](https://www.septa.org/developer/)
- [Model Context Protocol Documentation](https://modelcontextprotocol.io/)
- [Vercel Go Runtime](https://vercel.com/docs/functions/runtimes/go)
- [mark3labs/mcp-go Library](https://github.com/mark3labs/mcp-go)

## Support

For issues or questions:
- Check existing GitHub Issues
- Create a new issue with details about your problem
- Include error messages and steps to reproduce

---

**Note:** This is an unofficial tool and is not affiliated with or endorsed by SEPTA.
