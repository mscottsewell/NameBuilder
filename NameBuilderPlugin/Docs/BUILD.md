# Build Instructions

## Using VS Code

1. Open the `DataverseNamePlugin` folder in VS Code
2. Open the integrated terminal (Ctrl+`)
3. Restore NuGet packages:

   ```powershell
   dotnet restore
   ```

4. Build the project:

   ```powershell
   # Debug build
   dotnet build
   
   # Release build
   dotnet build --configuration Release
   ```

5. The compiled assembly will be in:
   - Debug: `DataverseNamePlugin\bin\Debug\net462\DataverseNameBuilder.dll`
   - Release: `DataverseNamePlugin\bin\Release\net462\DataverseNameBuilder.dll`

**Recommended Extensions:**

- [C# Dev Kit](https://marketplace.visualstudio.com/items?itemName=ms-dotnettools.csdevkit) - For IntelliSense, debugging, and .NET project support

## Using Visual Studio

1. Open `DataverseNamePlugin.sln` in Visual Studio
2. Right-click the solution in Solution Explorer
3. Select **Restore NuGet Packages**
4. Build the solution:
   - Menu: **Build** > **Build Solution** (or press Ctrl+Shift+B)
   - Or right-click solution > **Build**
5. The compiled assembly will be in:
   - Debug: `DataverseNamePlugin\bin\Debug\net462\DataverseNameBuilder.dll`
   - Release: `DataverseNamePlugin\bin\Release\net462\DataverseNameBuilder.dll`

## Using .NET CLI

```powershell
# Navigate to solution directory
cd C:\DataverseNamePlugin

# Restore packages
dotnet restore

# Build (Debug)
dotnet build

# Build (Release)
dotnet build --configuration Release
```

## Using MSBuild

```powershell
# Restore packages
msbuild DataverseNamePlugin.sln /t:Restore

# Build (Release)
msbuild DataverseNamePlugin.sln /p:Configuration=Release
```

## Signing the Assembly (Required for Dataverse)

**Important:** Dataverse requires plugins to be strongly signed. A strong name key file is required.

### Option 1: Use an existing key file

If you have an existing `.snk` file, place it in the root directory as `DataverseNamePlugin.snk`.

### Option 2: Generate using Visual Studio

1. Open the project in Visual Studio
2. Right-click the project > **Properties**
3. Go to **Signing** tab
4. Check **Sign the assembly**
5. Choose **<New...>** from the dropdown
6. Enter key file name: `DataverseNamePlugin`
7. Optionally protect with a password
8. Click **OK**

### Option 3: Generate using sn.exe (if available)

```powershell
# From Visual Studio Developer Command Prompt or PowerShell
sn -k DataverseNamePlugin.snk
```

### Option 4: Use ILMerge.Fody or similar tool

If you cannot generate a key file, consider using tools like ILMerge.Fody that can sign assemblies as part of the build process.

**Note:** The project is already configured to sign with `DataverseNamePlugin.snk` in the root directory. Once you create the key file, simply rebuild

## Troubleshooting Build Issues

### NuGet Package Restore Fails

```powershell
# Clear NuGet cache
dotnet nuget locals all --clear

# Restore again
dotnet restore
```

### Missing .NET Framework 4.6.2

- Download and install from: <https://dotnet.microsoft.com/download/dotnet-framework/net462>
- Or modify `TargetFramework` in the .csproj to a version you have installed

### Build Errors

- Ensure you have Visual Studio 2019 or later with .NET Framework development tools
- Check that all NuGet packages are restored
- Clean and rebuild: **Build** > **Clean Solution**, then **Build** > **Rebuild Solution**
