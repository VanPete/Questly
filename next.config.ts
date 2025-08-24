const nextConfig = {
  // Silence workspace root inference warnings by pinning Turbopack root.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
