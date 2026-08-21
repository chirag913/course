// Side-effecting import registers the YouTube adapter. Add future providers
// (e.g. `import "./cloudflareStream"`) here and nowhere else.
import "./youtube";

export { getVideoProvider, type VideoProviderAdapter, type VideoEmbedOptions } from "./provider";
