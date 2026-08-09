' Windows Controller - Start server hidden at login
' Uses WScript.Shell to run node in the background without a console window

Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

' Get the project root directory (parent of the autorun folder)
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
projectDir = fso.GetParentFolderName(scriptDir)

' Node.js path
nodeExe = shell.ExpandEnvironmentStrings("%PROGRAMFILES%") & "\nodejs\node.exe"
If Not fso.FileExists(nodeExe) Then
  nodeExe = shell.ExpandEnvironmentStrings("%PROGRAMFILES(x86)%") & "\nodejs\node.exe"
End If

' Server entry point
serverJs = projectDir & "\server\server.js"

' Start the server hidden
If fso.FileExists(nodeExe) And fso.FileExists(serverJs) Then
  shell.Run """" & nodeExe & """ """ & serverJs & """", 0, False
End If