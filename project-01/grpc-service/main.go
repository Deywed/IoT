package main

import (
	"context"
	"database/sql"
	"fmt"
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

// SCENARIO A: Upis merenja (high-frequency ingestion)
func (s *server) SaveMeasurement(ctx context.Context, req *pb.MeasurementRequest) (*pb.MeasurementResponse, error) {
	recordedAt := req.RecordedAt
	if recordedAt == "" {
		recordedAt = time.Now().UTC().Format(time.RFC3339)
	}

	query := `INSERT INTO sensor_measurements (recorded_at, overall_usage, temperature, summary)
	          VALUES ($1, $2, $3, $4)`

	_, err := s.db.Exec(query, recordedAt, req.UsageOverall, req.Temperature, req.Summary)
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
		SELECT id, recorded_at, overall_usage, temperature, summary, fridge_kw, furnace_kw, humidity
		FROM sensor_measurements ORDER BY recorded_at DESC LIMIT $1`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var measurements []*pb.MeasurementData
	for rows.Next() {
		var (
			id          int64
			recordedAt  time.Time
			usage       sql.NullFloat64
			temperature sql.NullFloat64
			summary     sql.NullString
			fridgeKw    sql.NullFloat64
			furnaceKw   sql.NullFloat64
			humidity    sql.NullFloat64
		)
		if err := rows.Scan(&id, &recordedAt, &usage, &temperature, &summary, &fridgeKw, &furnaceKw, &humidity); err != nil {
			return nil, err
		}
		m := &pb.MeasurementData{
			Id:          id,
			RecordedAt:  recordedAt.Format(time.RFC3339),
			UsageOverall: float32(usage.Float64),
			Temperature: float32(temperature.Float64),
			Summary:     summary.String,
			FridgeKw:    float32(fridgeKw.Float64),
			FurnaceKw:   float32(furnaceKw.Float64),
			Humidity:    float32(humidity.Float64),
		}
		measurements = append(measurements, m)
	}
	return &pb.MeasurementsResponse{Measurements: measurements}, nil
}

// SCENARIO B: Selective monitoring — samo temperature + humidity
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

// SCENARIO C: Agregacije nad istorijskim podacima
func (s *server) GetStats(ctx context.Context, req *pb.StatsRequest) (*pb.StatsResponse, error) {
	row := s.db.QueryRowContext(ctx, `
		SELECT AVG(temperature), MAX(temperature), COUNT(*)
		FROM sensor_measurements`)

	var avgTemp, maxTemp sql.NullFloat64
	var total int64
	if err := row.Scan(&avgTemp, &maxTemp, &total); err != nil {
		return nil, err
	}
	return &pb.StatsResponse{
		AvgTemperature: float32(avgTemp.Float64),
		MaxTemperature: float32(maxTemp.Float64),
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
	fmt.Println("✅ Baza je spremna.")

	lis, err := net.Listen("tcp", ":50051")
	if err != nil {
		log.Fatalf("Neuspešno slušanje na portu 50051: %v", err)
	}

	grpcServer := grpc.NewServer()
	pb.RegisterSensorServiceServer(grpcServer, &server{db: db})
	reflection.Register(grpcServer)

	fmt.Println("🚀 gRPC Server pokrenut na portu :50051...")
	if err := grpcServer.Serve(lis); err != nil {
		log.Fatalf("Greška pri pokretanju servera: %v", err)
	}
}
