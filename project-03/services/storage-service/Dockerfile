FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /app
COPY *.csproj .
RUN dotnet restore
COPY . .
RUN dotnet publish -c Release -o /publish

# MQTT-only (Projekat 3): Kafka/librdkafka runtime (libsasl2) nije potreban.
FROM mcr.microsoft.com/dotnet/runtime:10.0
WORKDIR /app
COPY --from=build /publish .
ENTRYPOINT ["dotnet", "storage-service.dll"]
