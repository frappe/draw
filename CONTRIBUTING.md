# Contributing to Frappe Draw

Thanks for your interest in improving Frappe Draw!

## Development setup

1. Get the app into a [Frappe bench](https://github.com/frappe/bench):
   ```bash
   bench get-app https://github.com/frappe/draw
   bench --site your-site.localhost install-app draw
   ```
2. Install frontend dependencies and build:
   ```bash
   cd apps/draw/frontend
   yarn install
   yarn build
   ```
3. Run the frontend unit tests:
   ```bash
   yarn test
   ```

## Before opening a pull request

- Enable pre-commit so your changes are auto-formatted and linted:
  ```bash
  cd apps/draw
  pre-commit install
  ```
- Keep each PR focused on one change, and add tests where it makes sense.
- Make sure `yarn build` and `yarn test` pass.
- Open the pull request against `main` and describe **what** changed and **why**.

## License of contributions

By contributing, you agree that your contributions are licensed under the
project's [GNU Affero General Public License v3.0](license.txt).
