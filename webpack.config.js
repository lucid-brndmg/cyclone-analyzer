import path from 'path';
import {fileURLToPath} from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const buildConfig = ( platform, extensions ) => ({
  mode: "production",
  entry: `./src/index.js`,
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: `cyclone-analyzer.${extensions === "mjs" ? platform : "common" }.${extensions}`,
    chunkFormat: extensions === "mjs" ? "module" : "commonjs",
    library: {
      type: extensions === "mjs" ? "module" : "commonjs"
    }
  },

  module: {
    rules: [{
      test: /\.js$/,
      exclude: /node_modules/,
      use: [ 'babel-loader' ]
    }]
  },
  resolve: {
    extensions: [ '.js'],
  },

  ...(platform === 'web' && {
    performance: {
      maxAssetSize: 512000,
      maxEntrypointSize: 512000
    }
  }),
  target: platform,
  devtool: "source-map",
  experiments: {
    outputModule: extensions === "mjs"
  },
})


export default [
  // buildConfig("node", "cjs"),
  buildConfig("node", "mjs"),
  buildConfig("web", "cjs"),
  buildConfig("web", "mjs"),
];
