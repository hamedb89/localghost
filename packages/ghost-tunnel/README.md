# Internal Ghost Tunnel Package

Internal workspace package containing Ghost Tunnel configuration, relay, local
agent, request, and Vercel transport primitives for Localghost.

It is bundled into `@hamedb89/localghost` and is not distributed separately.
The package does not load Localghost project configuration directly; the root
package supplies that integration through a resolver.
