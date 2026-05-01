// Koristimo alias da izbegnemo konflikt sa rečju "Models"
using OpenApiModels = Microsoft.OpenApi.Models;

var builder = WebApplication.CreateBuilder(args);

// Dodajemo servise
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new OpenApiModels.OpenApiInfo
    {
        Title = "IoT Sensor API",
        Version = "v1"
    });
});

var app = builder.Build();

// Konfiguracija pipeline-a
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI(c =>
    {
        c.SwaggerEndpoint("/swagger/v1/swagger.json", "v1");
    });
}

app.MapControllers();

app.Run();