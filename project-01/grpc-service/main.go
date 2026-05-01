package main

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"net"

	// PAŽNJA: Proveri u go.mod kako ti se zove modul.
	// Ako je "gRPC", onda ide "gRPC/pb". Ako je nešto drugo, zameni ovde.
	pb "iot-project/proto"

	_ "github.com/jackc/pgx/v5/stdlib"
	"google.golang.org/grpc"
)

// 1. Definišemo server strukturu.
// Ona mora da sadrži db konekciju da bismo mogli da upisujemo podatke unutar metoda.
type server struct {
	pb.UnimplementedSensorServiceServer
	db *sql.DB
}

// 2. Implementiramo SaveMeasurement metodu koju smo definisali u .proto fajlu

func (s *server) SaveMeasurement(ctx context.Context, req *pb.MeasurementRequest) (*pb.MeasurementResponse, error) {
	fmt.Printf("📥 Primljeno merenje sa .NET klijenta: Temp=%.2f, Summary=%s\n", req.Temperature, req.Summary)

	// SQL upit koristi nazive kolona iz tvog init.sql
	query := `
        INSERT INTO sensor_measurements (recorded_at, overall_usage, temperature, summary)
        VALUES ($1, $2, $3, $4)`

	// Podatke uzimamo iz 'req' objekta koji nam je gRPC klijent poslao
	_, err := s.db.Exec(query, req.RecordedAt, req.UsageOverall, req.Temperature, req.Summary)
	
	if err != nil {
		log.Printf("❌ Greška pri upisu u bazu: %v", err)
		return &pb.MeasurementResponse{
			Success: false, 
			Message: "Greška pri upisu u bazu",
		}, err
	}

	return &pb.MeasurementResponse{
		Success: true, 
		Message: "Uspešno upisano u Postgres!",
	}, nil
}

func main() {
	// 3. Konekcija na bazu (ostaje ista kao tvoja stara)
	connStr := "postgres://myuser:mypassword@localhost:5432/mydb"
	db, err := sql.Open("pgx", connStr)
	if err != nil {
		log.Fatal("Greška pri otvaranju baze:", err)
	}
	defer db.Close()

	// Provera baze
	if err := db.Ping(); err != nil {
		log.Fatal("Baza nedostupna:", err)
	}
	fmt.Println("✅ Baza je spremna.")

	// 4. Pokretanje gRPC slušalaca
	lis, err := net.Listen("tcp", ":50051") // gRPC port
	if err != nil {
		log.Fatalf("Neuspešno slušanje na portu 50051: %v", err)
	}

	grpcServer := grpc.NewServer()
	
	// Registrujemo naš server sa db konekcijom
	pb.RegisterSensorServiceServer(grpcServer, &server{db: db})

	fmt.Println("🚀 gRPC Server pokrenut na portu :50051...")
	if err := grpcServer.Serve(lis); err != nil {
		log.Fatalf("Greška pri pokretanju servera: %v", err)
	}
}