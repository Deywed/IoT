FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /app
COPY *.csproj .
RUN dotnet restore
COPY . .
RUN dotnet publish -c Release -o /publish

# Debian-based runtime (NE alpine) — Confluent.Kafka/librdkafka traži glibc + libsasl2/libssl.
FROM mcr.microsoft.com/dotnet/runtime:10.0
RUN apt-get update \
    && apt-get install -y --no-install-recommends libsasl2-2 \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /publish .
ENTRYPOINT ["dotnet", "storage-service.dll"]
