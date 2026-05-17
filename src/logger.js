import pino from "pino";

const level = process.env.LOG_LEVEL ?? "info";
const pretty = process.stderr.isTTY && process.env.LOG_FORMAT !== "json";

export const logger = pretty
  ? pino({
      level,
      base: undefined,
      transport: {
        target: "pino-pretty",
        options: {
          destination: 2,
          colorize: true,
          translateTime: "HH:MM:ss.l",
          ignore: "pid,hostname",
          singleLine: true,
        },
      },
    })
  : pino({ level, base: undefined }, pino.destination(2));
