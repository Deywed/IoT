export const typeDefs = `#graphql
  # Definišemo tip podatka koji odgovara našoj tabeli u bazi
  type Measurement {
    id: ID!
    recorded_at: String!
    overall_usage: Float!
    fridge_kw: Float
    dishwasher_kw: Float
    furnace_kw: Float
    temperature: Float!
    humidity: Float
    summary: String
  }

  # Definišemo koje upite (Queries) klijent može da izvrši
  type Query {
    # Vraća listu svih merenja
    getAllMeasurements: [Measurement]
    
    # Vraća jedno specifično merenje na osnovu ID-a
    getMeasurementById(id: ID!): Measurement
    
    # Scenario C: Statistika
    getAverageTemperature: Float
  }

  type Mutation {
    createMeasurement(
      recorded_at: String,
      overall_usage: Float!,
      temperature: Float!,
      summary: String
    ): Measurement
  }
`;
