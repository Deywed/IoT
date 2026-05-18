package main

import (
	"context"
	"database/sql"
	"log"
	"net"
	"os"
	"time"

	pb "iot-project/proto"

	_ "github.com/jackc/pgx/v5/stdlib"
	"google.golang.org/grpc"
	"google.golang.org/grpc/reflection"
)

type server struct {
	pb.UnimplementedSensorServiceServer
	db *sql.DB
}

// SCENARIO A: Upis merenja 
func (s *server) SaveMeasurement(ctx context.Context, req *pb.MeasurementRequest) (*pb.MeasurementResponse, error) {
	recordedAt := req.RecordedAt
	if recordedAt == "" {
		recordedAt = time.Now().UTC().Format(time.RFC3339)
	}

	_, err := s.db.ExecContext(ctx, `
		INSERT INTO sensor_measurements
			(recorded_at, overall_usage, solar_generation, fridge_kw, furnace_kw, home_office_kw, temperature, humidity, summary)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
		recordedAt,
		req.UsageOverall, req.SolarGeneration, req.FridgeKw,
		req.FurnaceKw, req.HomeOfficeKw, req.Temperature,
		req.Humidity, req.Summary,
	)
	if err != nil {
		log.Printf("Greška pri upisu: %v", err)
		return &pb.MeasurementResponse{Success: false, Message: "Greška pri upisu"}, err
	}
	return &pb.MeasurementResponse{Success: true, Message: "Uspešno upisano"}, nil
}

// Čitanje liste merenja
func (s *server) GetMeasurements(ctx context.Context, req *pb.GetMeasurementsRequest) (*pb.MeasurementsResponse, error) {
	limit := req.Limit
	if limit <= 0 {
		limit = 100
	}

	rows, err := s.db.QueryContext(ctx, `
		SELECT id, recorded_at, overall_usage, solar_generation, fridge_kw,
		       furnace_kw, home_office_kw, temperature, humidity, summary
		FROM sensor_measurements ORDER BY recorded_at DESC LIMIT $1`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var measurements []*pb.MeasurementData
	for rows.Next() {
		var (
			id             int64
			recordedAt     time.Time
			usage          sql.NullFloat64
			solar          sql.NullFloat64
			fridge         sql.NullFloat64
			furnace        sql.NullFloat64
			homeOffice     sql.NullFloat64
			temperature    sql.NullFloat64
			humidity       sql.NullFloat64
			summary        sql.NullString
		)
		if err := rows.Scan(&id, &recordedAt, &usage, &solar, &fridge, &furnace, &homeOffice, &temperature, &humidity, &summary); err != nil {
			return nil, err
		}
		measurements = append(measurements, &pb.MeasurementData{
			Id:              id,
			RecordedAt:      recordedAt.Format(time.RFC3339),
			UsageOverall:    float32(usage.Float64),
			SolarGeneration: float32(solar.Float64),
			FridgeKw:        float32(fridge.Float64),
			FurnaceKw:       float32(furnace.Float64),
			HomeOfficeKw:    float32(homeOffice.Float64),
			Temperature:     float32(temperature.Float64),
			Humidity:        float32(humidity.Float64),
			Summary:         summary.String,
		})
	}
	return &pb.MeasurementsResponse{Measurements: measurements}, nil
}

// SCENARIO B: Selective 
func (s *server) GetSelectiveData(ctx context.Context, req *pb.SelectiveRequest) (*pb.SelectiveResponse, error) {
	limit := req.Limit
	if limit <= 0 {
		limit = 100
	}

	rows, err := s.db.QueryContext(ctx, `
		SELECT id, recorded_at, temperature, humidity
		FROM sensor_measurements ORDER BY recorded_at DESC LIMIT $1`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var data []*pb.SelectiveData
	for rows.Next() {
		var (
			id          int64
			recordedAt  time.Time
			temperature sql.NullFloat64
			humidity    sql.NullFloat64
		)
		if err := rows.Scan(&id, &recordedAt, &temperature, &humidity); err != nil {
			return nil, err
		}
		data = append(data, &pb.SelectiveData{
			Id:          id,
			RecordedAt:  recordedAt.Format(time.RFC3339),
			Temperature: float32(temperature.Float64),
			Humidity:    float32(humidity.Float64),
		})
	}
	return &pb.SelectiveResponse{Data: data}, nil
}

// SCENARIO C: Agregacije
func (s *server) GetStats(ctx context.Context, req *pb.StatsRequest) (*pb.StatsResponse, error) {
	row := s.db.QueryRowContext(ctx, `
		SELECT AVG(temperature), MAX(temperature),
		       AVG(overall_usage), MAX(overall_usage),
		       COUNT(*)
		FROM sensor_measurements`)

	var avgTemp, maxTemp, avgUsage, maxUsage sql.NullFloat64
	var total int64
	if err := row.Scan(&avgTemp, &maxTemp, &avgUsage, &maxUsage, &total); err != nil {
		return nil, err
	}
	return &pb.StatsResponse{
		AvgTemperature: float32(avgTemp.Float64),
		MaxTemperature: float32(maxTemp.Float64),
		AvgUsage:       float32(avgUsage.Float64),
		MaxUsage:       float32(maxUsage.Float64),
		TotalReadings:  total,
	}, nil
}

func main() {
	connStr := os.Getenv("DB_CONN")
	if connStr == "" {
		connStr = "postgres://myuser:mypassword@localhost:5432/mydb"
	}

	db, err := sql.Open("pgx", connStr)
	if err != nil {
		log.Fatal("Greška pri otvaranju baze:", err)
	}
	defer db.Close()

	if err := db.Ping(); err != nil {
		log.Fatal("Baza nedostupna:", err)
	}

	lis, err := net.Listen("tcp", ":50051")
	if err != nil {
		log.Fatal("Greška pri slusanju na portu 50051:", err)
	}

	grpcServer := grpc.NewServer()
	pb.RegisterSensorServiceServer(grpcServer, &server{db: db})
	reflection.Register(grpcServer)

	if err := grpcServer.Serve(lis); err != nil {
		log.Fatalf("Greška: %v", err)
	}
}
