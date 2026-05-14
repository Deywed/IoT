FROM golang:latest AS build
WORKDIR /app

RUN apt-get update && apt-get install -y protobuf-compiler

RUN go install google.golang.org/protobuf/cmd/protoc-gen-go@v1.36.11 && \
    go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@v1.6.1

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN protoc --go_out=. --go_opt=paths=source_relative \
           --go-grpc_out=. --go-grpc_opt=paths=source_relative \
           proto/iot.proto

RUN CGO_ENABLED=0 GOOS=linux go build -o grpc-server .

FROM alpine:latest
WORKDIR /app
COPY --from=build /app/grpc-server .
EXPOSE 50051
ENTRYPOINT ["./grpc-server"]
