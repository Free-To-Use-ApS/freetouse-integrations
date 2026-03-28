import path from "path";
import { fileURLToPath } from "url";
import webpack from "webpack";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const config: webpack.Configuration = {
  entry: "./src/index.tsx",
  output: {
    filename: "bundle.js",
    path: path.resolve(__dirname, "dist"),
    clean: true,
    publicPath: "/",
  },
  resolve: {
    extensions: [".tsx", ".ts", ".js", ".jsx"],
    symlinks: true,
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: "ts-loader",
        exclude: /node_modules/,
      },
      {
        test: /\.css$/,
        use: ["style-loader", "css-loader"],
      },
      {
        test: /\.(png|jpe?g|gif|svg)$/,
        type: "asset/inline",
      },
      {
        test: /\.(woff|woff2)$/,
        type: "asset/inline",
      },
    ],
  },
  plugins: [
    new webpack.optimize.LimitChunkCountPlugin({
      maxChunks: 1,
    }),
  ],
  devServer: {
    port: 8080,
    server: "https",
    setupMiddlewares: (middlewares: any[], devServer: any) => {
      // Rewrite root to serve bundle.js — Canva loads the JS bundle from the root URL
      devServer.app.get("/", (_req: any, _res: any, next: any) => {
        _req.url = "/bundle.js";
        next();
      });
      return middlewares;
    },
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Private-Network": "true",
    },
    hot: false,
    allowedHosts: "all",
  },
};

export default config;
