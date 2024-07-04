import * as vscode from "vscode";
import * as https from "https";
import { URL } from "url";

const openCloudBaseUrl = "https://apis.roblox.com/cloud/v2/";

interface Headers {
  [key: string]: string;
}

interface RequestOptionsWithBody extends https.RequestOptions {
  body?: string;
}

function fetchJson(url: string, options: RequestOptionsWithBody): Promise<any> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const requestOptions: RequestOptionsWithBody = {
      ...options,
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      protocol: parsedUrl.protocol,
    };

    const req = https.request(requestOptions, (res) => {
      let data = "";

      res.on("data", (chunk) => {
        data += chunk;
      });

      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve(json);
          } else {
            reject(
              new Error(
                `HTTP error! Status: ${res.statusCode}, Message: ${
                  json.message || data
                }`
              )
            );
          }
        } catch (error) {
          if (error instanceof Error) {
            reject(new Error(`Error parsing JSON response: ${error.message}`));
          } else {
            reject(new Error(`Unknown error: ${error}`));
          }
        }
      });
    });

    req.on("error", (e) => {
      reject(new Error(`Request error: ${e.message}`));
    });

    if (options.method === "POST" || options.method === "PATCH") {
      req.write(options.body || "");
    }

    req.end();
  });
}

async function ReadScript(
  apiKey: string,
  path: string,
  universeId: string,
  placeId: string,
  type: string
): Promise<string> {
  const headers: Headers = {
    "x-api-key": apiKey,
    "Content-Type": "application/json",
  };

  // Find the instance ID from the root
  const targetInstanceId = await FindInstanceIdFromRoot(
    path,
    universeId,
    placeId,
    headers
  );

  // Get the instance details
  const instance = await GetInstance(
    targetInstanceId,
    universeId,
    placeId,
    headers
  );

  // Return the script source
  return instance.Details[type].Source;
}

async function GetInstance(
  id: string,
  universeId: string,
  placeId: string,
  headers: Headers
) {
  const instanceUrl = `${openCloudBaseUrl}universes/${universeId}/places/${placeId}/instances/${id}`;
  const response = await fetchJson(instanceUrl, { headers, method: "GET" });
  const engineInstance = await GetOperationResult(response.path, headers);
  return engineInstance.engineInstance;
}

async function ListChildren(
  id: string,
  universeId: string,
  placeId: string,
  headers: Headers
) {
  const instanceUrl = `${openCloudBaseUrl}universes/${universeId}/places/${placeId}/instances/${id}:listchildren`;
  const response = await fetchJson(instanceUrl, { headers, method: "GET" });
  const instances = await GetOperationResult(response.path, headers);
  return instances.instances;
}

async function UpdateInstance(
  id: string,
  source: string,
  universeId: string,
  placeId: string,
  headers: Headers,
  type: string
) {
  const newInstance = await GetInstance(id, universeId, placeId, headers);
  const instanceUrl = `${openCloudBaseUrl}universes/${universeId}/places/${placeId}/instances/${id}`;

  newInstance.Details[type].Source = source;

  const body = { engineInstance: newInstance };
  const patchOptions: RequestOptionsWithBody = {
    headers,
    method: "PATCH",
    body: JSON.stringify(body),
  };

  const response = await fetchJson(instanceUrl, patchOptions);
  const engineInstance = await GetOperationResult(response.path, headers);
  return engineInstance;
}

async function GetOperationResult(path: string, headers: Headers) {
  let done = false;
  let response: any;

  while (!done) {
    const operationUrl = `${openCloudBaseUrl}${path}`;
    response = await fetchJson(operationUrl, { headers, method: "GET" });
    done = response.done;
    console.log(response);
    if (!done) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  return response.response;
}

async function UpdateScript(
  apiKey: string,
  path: string,
  universeId: string,
  placeId: string,
  type: string,
  source: string
) {
  console.log("Attempting to update script");

  const headers: Headers = {
    "x-api-key": apiKey,
    "Content-Type": "application/json",
  };

  const targetInstanceId = await FindInstanceIdFromRoot(
    path,
    universeId,
    placeId,
    headers
  );
  await UpdateInstance(
    targetInstanceId,
    source,
    universeId,
    placeId,
    headers,
    type
  );
  console.log("Done updating script");
}

async function FindInstanceIdFromRoot(
  path: string,
  universeId: string,
  placeId: string,
  headers: Headers
) {
  const instanceNodes = path.split("/");
  let currentNodeId = "root";

  for (const node of instanceNodes) {
    const children = await ListChildren(
      currentNodeId,
      universeId,
      placeId,
      headers
    );
    const targetNode = children.find(
      (e: any) => e.engineInstance.Name === node
    );
    if (!targetNode) {
      throw new Error(`Node ${node} not found`);
    }
    currentNodeId = targetNode.engineInstance.Id;
  }

  return currentNodeId;
}

export function activate(context: vscode.ExtensionContext) {
  console.log("The RBLX VS Code extension is now active and ready!");
  let apiKey = "";
  let path = "";
  let universeId = "";
  let placeId = "";
  let type = "";

  const registerCommand = (
    commandId: string,
    getTitle: () => string,
    callback: (value: string) => void
  ) => {
    return vscode.commands.registerCommand(commandId, () => {
      const input = vscode.window.createInputBox();
      input.title = getTitle();
      input.show();
      input.onDidAccept(() => {
        input.hide();
        callback(input.value);
      });
    });
  };

  const setKey = registerCommand(
    "setkey.setkey",
    () => "Please Input Your API Key!",
    (value) => {
      apiKey = value;
      vscode.window.showWarningMessage(`Key: ${apiKey}`);
    }
  );

  const setPath = registerCommand(
    "setpath.setpath",
    () => "Please Input Your Path To Script! EX: ReplicatedStorage/MyScript",
    (value) => {
      path = value;
    }
  );

  const setUniverseId = registerCommand(
    "setuniverseid.setuniverseid",
    () => "Please Input Your Universe Id!",
    (value) => {
      universeId = value;
    }
  );

  const setPlaceId = registerCommand(
    "setplaceid.setplaceid",
    () => "Please Input Your Place Id!",
    (value) => {
      placeId = value;
    }
  );

  const settype = registerCommand(
    "settype.settype",
    () => "Please Input Your Type!",
    (value) => {
      type = value;
    }
  );

  const setAll = vscode.commands.registerCommand("setall.setall", async () => {
    const input = vscode.window.createInputBox();

    const getInput = (title: string) => {
      return new Promise<string>((resolve) => {
        input.title = title;
        input.show();
        input.onDidAccept(() => {
          const value = input.value;
          input.hide();
          resolve(value);
        });
      });
    };

    apiKey = await getInput("Please Input Your API Key!");
    path = await getInput(
      "Please Input Your Path To Script! EX: ReplicatedStorage/MyScript"
    );
    placeId = await getInput("Please Input Your Place Id!");
    universeId = await getInput("Please Input Your Universe Id!");
    type = await getInput("Please Input Your Type!");
  });

  const updateScript = vscode.commands.registerCommand(
    "updatescript.updatescript",
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        try {
          const text: string = editor.document.getText();
          await UpdateScript(apiKey, path, universeId, placeId, type, text);
          vscode.window.showInformationMessage("Script updated successfully!");
        } catch (error) {
          if (error instanceof Error) {
            vscode.window.showErrorMessage(
              `Error updating script: ${error.message}`
            );
          } else {
            vscode.window.showErrorMessage(`Unknown error occurred`);
          }
        }
      } else {
        vscode.window.showErrorMessage(
          "No active text editor found. Please open a script file."
        );
      }
    }
  );

  const syncScript = vscode.commands.registerCommand(
    "syncscript.syncscript",
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        try {
          let source = await ReadScript(
            apiKey,
            path,
            universeId,
            placeId,
            type
          );
          // Get the document from the active text editor
          const document = editor.document;

          // Create a range that covers the entire document
          const firstLine = document.lineAt(0);
          const lastLine = document.lineAt(document.lineCount - 1);
          const textRange = new vscode.Range(
            firstLine.range.start,
            lastLine.range.end
          );

          // Apply the edit (replace the entire document content with the new content)
          await editor.edit((editBuilder) => {
            editBuilder.replace(textRange, source);
          });
          vscode.window.showInformationMessage("Synced successfully!");
        } catch (error) {
          if (error instanceof Error) {
            vscode.window.showErrorMessage(`Error syncing: ${error.message}`);
          } else {
            vscode.window.showErrorMessage(`Unknown error occurred`);
          }
        }
      } else {
        vscode.window.showErrorMessage(
          "No active text editor found. Please open a script file."
        );
      }
    }
  );

  const item = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  item.text = "RBLX";
  item.tooltip = "RBLX";
  item.show();

  context.subscriptions.push(
    setKey,
    setPath,
    setUniverseId,
    setPlaceId,
    setAll,
    settype,
    syncScript,
    updateScript,
    item
  );
}

export function deactivate() {}
