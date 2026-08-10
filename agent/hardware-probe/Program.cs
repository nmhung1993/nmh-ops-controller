using System.Text.Json;
using LibreHardwareMonitor.Hardware;

if (args.Length != 1)
{
    Console.Error.WriteLine("Usage: HardwareProbe <output-json>");
    return 2;
}

var outputPath = Path.GetFullPath(args[0]);
var outputDirectory = Path.GetDirectoryName(outputPath) ?? throw new InvalidOperationException("Invalid output path.");
Directory.CreateDirectory(outputDirectory);

var computer = new Computer
{
    IsCpuEnabled = true,
    IsGpuEnabled = true,
    IsMemoryEnabled = true,
    IsMotherboardEnabled = true,
    IsControllerEnabled = true,
    IsStorageEnabled = true
};

try
{
    computer.Open();
    AppDomain.CurrentDomain.ProcessExit += (_, _) => computer.Close();
    var updater = new UpdateVisitor();
    while (true)
    {
        try
        {
            computer.Accept(updater);
            var sensors = new List<SensorSnapshot>();
            foreach (var hardware in computer.Hardware)
            {
                CollectSensors(hardware, sensors);
            }

            var payload = new ProbeSnapshot(DateTime.UtcNow, sensors);
            var temporaryPath = outputPath + ".tmp";
            File.WriteAllText(temporaryPath, JsonSerializer.Serialize(payload, new JsonSerializerOptions
            {
                PropertyNamingPolicy = JsonNamingPolicy.CamelCase
            }));
            File.Move(temporaryPath, outputPath, true);
        }
        catch (Exception error)
        {
            File.AppendAllText(Path.Combine(outputDirectory, "hardware-probe.log"), $"{DateTime.UtcNow:O} {error}\n");
        }

        Thread.Sleep(TimeSpan.FromSeconds(5));
    }
}
catch (Exception error)
{
    File.AppendAllText(Path.Combine(outputDirectory, "hardware-probe.log"), $"{DateTime.UtcNow:O} startup {error}\n");
    return 1;
}
finally
{
    computer.Close();
}

static void CollectSensors(IHardware hardware, List<SensorSnapshot> snapshots)
{
    foreach (var sensor in hardware.Sensors)
    {
        if (sensor.Value is null || (sensor.SensorType != SensorType.Temperature && sensor.SensorType != SensorType.Power))
        {
            continue;
        }
        if (sensor.SensorType == SensorType.Power && sensor.Value.Value <= 0)
        {
            continue;
        }
        if (sensor.SensorType == SensorType.Temperature &&
            (sensor.Value.Value <= 0 || sensor.Value.Value > 150 ||
             sensor.Name.Contains("Warning Temperature", StringComparison.OrdinalIgnoreCase) ||
             sensor.Name.Contains("Critical Temperature", StringComparison.OrdinalIgnoreCase)))
        {
            continue;
        }

        snapshots.Add(new SensorSnapshot(
            hardware.Identifier.ToString(),
            hardware.HardwareType.ToString(),
            hardware.Name.TrimEnd('\0', ' '),
            sensor.Identifier.ToString(),
            sensor.Name,
            sensor.SensorType.ToString(),
            sensor.Value.Value));
    }

    foreach (var child in hardware.SubHardware)
    {
        CollectSensors(child, snapshots);
    }
}

internal sealed record ProbeSnapshot(DateTime SampledAt, IReadOnlyList<SensorSnapshot> Sensors);

internal sealed record SensorSnapshot(
    string HardwareId,
    string HardwareType,
    string HardwareName,
    string SensorId,
    string SensorName,
    string SensorType,
    float Value);

internal sealed class UpdateVisitor : IVisitor
{
    public void VisitComputer(IComputer computer) => computer.Traverse(this);
    public void VisitHardware(IHardware hardware)
    {
        hardware.Update();
        foreach (var child in hardware.SubHardware)
        {
            child.Accept(this);
        }
    }
    public void VisitSensor(ISensor sensor) { }
    public void VisitParameter(IParameter parameter) { }
}
