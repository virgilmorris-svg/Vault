// VauLt Autofill — iOS Credential Provider Extension
// Reads the shared redacted login list from the App Group and shows a list.
// User taps → deep link `vault://autofill?domain=<host>` opens VauLt, which
// prompts biometric, decrypts locally and completes the extension request
// via ASCredentialProviderExtensionContext.
//
// Zero-knowledge preserved: the extension process never holds plaintext.

import AuthenticationServices
import UIKit

class CredentialProviderViewController: ASCredentialProviderViewController {

    struct EntryStub: Codable {
        let id: String
        let title: String
        let username: String?
        let url: String?
    }

    private var entries: [EntryStub] = []
    private var requestedIdentifier: ASCredentialServiceIdentifier?

    override func prepareCredentialList(for serviceIdentifiers: [ASCredentialServiceIdentifier]) {
        requestedIdentifier = serviceIdentifiers.first
        loadEntries()
        renderUI()
    }

    private func loadEntries() {
        let d = UserDefaults(suiteName: "group.com.emergent.vault")
        if let data = d?.data(forKey: "com.vault.quickcopy.entries"),
           let list = try? JSONDecoder().decode([EntryStub].self, from: data) {
            entries = list
        }
    }

    private func renderUI() {
        view.backgroundColor = UIColor(red: 0.035, green: 0.035, blue: 0.043, alpha: 1)
        let table = UITableView(frame: view.bounds, style: .plain)
        table.backgroundColor = .clear
        table.dataSource = self
        table.delegate = self
        table.register(UITableViewCell.self, forCellReuseIdentifier: "cell")
        view.addSubview(table)
    }

    private func openAppAndComplete(for entry: EntryStub) {
        // Open the app to biometric-auth + fetch plaintext. The app then
        // calls the extension back through App Group + completeRequest.
        let host = requestedIdentifier?.identifier ?? entry.url ?? ""
        let encoded = host.addingPercentEncoding(withAllowedCharacters: .urlHostAllowed) ?? host
        if let url = URL(string: "vault://autofill?entry_id=\(entry.id)&domain=\(encoded)") {
            self.extensionContext.open(url, completionHandler: nil)
        }
    }

    @IBAction func cancel(_ sender: AnyObject?) {
        extensionContext.cancelRequest(withError: NSError(domain: ASExtensionErrorDomain,
            code: ASExtensionError.userCanceled.rawValue))
    }
}

extension CredentialProviderViewController: UITableViewDataSource, UITableViewDelegate {
    func tableView(_ tv: UITableView, numberOfRowsInSection s: Int) -> Int { entries.count }
    func tableView(_ tv: UITableView, cellForRowAt i: IndexPath) -> UITableViewCell {
        let c = tv.dequeueReusableCell(withIdentifier: "cell", for: i)
        c.backgroundColor = UIColor(red: 0.094, green: 0.094, blue: 0.106, alpha: 1)
        c.textLabel?.textColor = .white
        c.detailTextLabel?.textColor = .lightGray
        c.textLabel?.text = entries[i.row].title
        c.detailTextLabel?.text = entries[i.row].username ?? entries[i.row].url
        return c
    }
    func tableView(_ tv: UITableView, didSelectRowAt i: IndexPath) {
        openAppAndComplete(for: entries[i.row])
        tv.deselectRow(at: i, animated: true)
    }
}
