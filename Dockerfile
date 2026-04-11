FROM oven/bun:1 AS builder

WORKDIR /src

COPY package.json bun.lock tsconfig.json ./
RUN bun install --frozen-lockfile

COPY collector ./collector
RUN cd collector && bun install --frozen-lockfile

COPY src ./src
COPY public ./public
COPY scripts ./scripts

ARG TARGETARCH
RUN bun run build:server:bin --arch=${TARGETARCH}
RUN cd collector && bun run build

FROM alpine:3.21

WORKDIR /app

RUN apk add --no-cache ca-certificates libstdc++

COPY --from=builder /src/dist/auction /app/auction
COPY --from=builder /src/public/app.css /app/public/app.css
COPY --from=builder /src/public/app.js /app/public/app.js
COPY --from=builder /public/vin.html /app/public/vin.html
COPY --from=builder /src/collector/dist /app/collector/dist

ENV NODE_ENV=production
ENV AUCTION_ROOT_DIR=/app
ENV PORT=3005
ENV AUCTION_DATA_DIR=/app/data
ENV AUCTION_MEDIA_DIR=/app/data/images
ENV AUCTION_SQLITE_PATH=/app/data/auction.sqlite
ENV AUCTION_COLLECTOR_RUNTIME_DIR=/app/collector/dist

EXPOSE 3005

CMD ["/app/auction"]
