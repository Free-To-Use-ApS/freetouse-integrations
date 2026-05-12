import path from "path";
import { fileURLToPath } from "url";
import webpack from "webpack";
import { transform } from "@formatjs/ts-transformer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Must match the `--id-interpolation-pattern` used by `formatjs extract`
 * so the message IDs in `messages_en.json` match what the runtime expects. */
const FORMATJS_ID_PATTERN = "[sha512:contenthash:base64:6]";

const config: webpack.Configuration = {
  mode: "development",
  devtool: "source-map",
  context: path.resolve(__dirname, "./"),
  entry: {
    app: path.join(__dirname, "src", "index.tsx"),
  },
  target: "web",
  output: {
    filename: "[name].js",
    path: path.resolve(__dirname, "dist"),
    clean: true,
  },
  resolve: {
    extensions: [".tsx", ".ts", ".js", ".css"],
    symlinks: true,
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: {
          loader: "ts-loader",
          options: {
            transpileOnly: true,
            getCustomTransformers() {
              return {
                before: [
                  transform({
                    overrideIdFn: FORMATJS_ID_PATTERN,
                  }),
                ],
              };
            },
          },
        },
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
    host: "localhost",
    allowedHosts: ["localhost"],
    historyApiFallback: {
      rewrites: [{ from: /^\/$/, to: "/app.js" }],
    },
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Allow-Private-Network": "true",
    },
    webSocketServer: false,
  },
};

export default config;
