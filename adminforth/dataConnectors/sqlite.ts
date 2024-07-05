import betterSqlite3 from 'better-sqlite3';
import { AdminForthDataTypes, AdminForthFilterOperators, AdminForthSortDirections, AdminForthDataSourceConnector, AdminForthResource, AdminForthResourceColumn } from '../types/AdminForthConfig.js';
import AdminForthBaseConnector from './baseConnector.js';
import dayjs from 'dayjs';

class SQLiteConnector extends AdminForthBaseConnector implements AdminForthDataSourceConnector {

    db: any;

    constructor({ url }: { url: string }) {
      super();
      // create connection here
      this.db = betterSqlite3(url.replace('sqlite://', ''));
    }

    async discoverFields(resource: AdminForthResource): Promise<{[key: string]: AdminForthResourceColumn}> {
        const tableName = resource.table;
        const stmt = this.db.prepare(`PRAGMA table_info(${tableName})`);
        const rows = await stmt.all();
        const fieldTypes = {};
        rows.forEach((row) => {
          const field: any = {};
          const baseType = row.type.toLowerCase();
          if (baseType == 'int') {
            field.type = AdminForthDataTypes.INTEGER;
            field._underlineType = 'int';
          } else if (baseType.includes('varchar(')) {
            field.type = AdminForthDataTypes.STRING;
            field._underlineType = 'varchar';
            const length = baseType.match(/\d+/);
            field.maxLength = length ? parseInt(length[0]) : null;
          } else if (baseType == 'text') {
            field.type = AdminForthDataTypes.TEXT;
            field._underlineType = 'text';
          } else if (baseType.includes('decimal(')) {
            field.type = AdminForthDataTypes.DECIMAL;
            field._underlineType = 'decimal';
            const [precision, scale] = baseType.match(/\d+/g);
            field.precision = parseInt(precision);
            field.scale = parseInt(scale);
          } else if (baseType == 'real') {
            field.type = AdminForthDataTypes.FLOAT; //8-byte IEEE floating point number. It
            field._underlineType = 'real';
          } else if (baseType == 'timestamp') {
            field.type = AdminForthDataTypes.DATETIME;
            field._underlineType = 'timestamp';
          } else if (baseType == 'boolean') {
            field.type = AdminForthDataTypes.BOOLEAN;
            field._underlineType = 'boolean';
          } else {
            field.type = 'unknown'
          }
          field._baseTypeDebug = baseType;
          field.required = row.notnull == 1;
          field.primaryKey = row.pk == 1;
          field.default = row.dflt_value;
          fieldTypes[row.name] = field
        });
        return fieldTypes;
    }

    getFieldValue(field: AdminForthResourceColumn, value: any): any {
      if (field.type == AdminForthDataTypes.DATETIME) {
        if (!value) {
          return null;
        }
        if (field._underlineType == 'timestamp' || field._underlineType == 'int') {
          return dayjs.unix(+value).toISOString();
        } else if (field._underlineType == 'varchar') {
          return dayjs(value).toISOString();
        } else {
          throw new Error(`AdminForth does not support row type: ${field._underlineType} for timestamps, use VARCHAR (with iso strings) or TIMESTAMP/INT (with unix timestamps). Issue in field "${field.name}"`);
        }

      } else if (field.type == AdminForthDataTypes.DATE) {
        if (!value) {
          return null;
        }
        return dayjs(value).toISOString().split('T')[0];

      } else if (field.type == AdminForthDataTypes.BOOLEAN) {
        return !!value;
      }

      return value;
    }

    async getRecordByPrimaryKeyWithOriginalTypes(resource: AdminForthResource, key: any): Promise<any> {
        const columns = resource.dataSourceColumns.map((col) => col.name).join(', ');
        const tableName = resource.table;
        const stmt = this.db.prepare(`SELECT ${columns} FROM ${tableName} WHERE ${this.getPrimaryKey(resource)} = ?`);
        const row = stmt.get(key);
        if (!row) {
            return null;
        }
        const newRow = {};
        for (const [key, value] of Object.entries(row)) {
            newRow[key] = value;
        }
        return newRow;
    }

    setFieldValue(field: AdminForthResourceColumn, value: any): any {
      if (field.type == AdminForthDataTypes.DATETIME) {
        if (!value) {
          return null;
        }
        if (field._underlineType == 'timestamp' || field._underlineType == 'int') {
          // value is iso string now, convert to unix timestamp
          return dayjs(value).unix();
        } else if (field._underlineType == 'varchar') {
          // value is iso string now, convert to unix timestamp
          return dayjs(value).toISOString();
        }
      } else if (field.type == AdminForthDataTypes.BOOLEAN) {
        return value ? 1 : 0;
      }

      return value;
    }

    OperatorsMap = {
      [AdminForthFilterOperators.EQ]: '=',
      [AdminForthFilterOperators.NE]: '!=',
      [AdminForthFilterOperators.GT]: '>',
      [AdminForthFilterOperators.LT]: '<',
      [AdminForthFilterOperators.GTE]: '>=',
      [AdminForthFilterOperators.LTE]: '<=',
      [AdminForthFilterOperators.LIKE]: 'LIKE',
      [AdminForthFilterOperators.ILIKE]: 'ILIKE',
      [AdminForthFilterOperators.IN]: 'IN',
      [AdminForthFilterOperators.NIN]: 'NOT IN',
    };

    SortDirectionsMap = {
      [AdminForthSortDirections.asc]: 'ASC',
      [AdminForthSortDirections.desc]: 'DESC',
    };
    

    async getDataWithOriginalTypes({ resource, limit, offset, sort, filters }: { 
        resource: AdminForthResource, 
        limit: number, 
        offset: number, 
        sort: { field: string, direction: AdminForthSortDirections }[], 
        filters: { field: string, operator: AdminForthFilterOperators, value: any }[] 
    }): Promise<{ data: any[], total: number }> {
      const columns = resource.dataSourceColumns.map((col) => col.name).join(', ');
      const tableName = resource.table;

      const where = filters.length ? `WHERE ${filters.map((f, i) => {
        let placeholder = '?';
        let field = f.field;
        let operator = this.OperatorsMap[f.operator];
        if (f.operator == AdminForthFilterOperators.IN || f.operator == AdminForthFilterOperators.NIN) {
          placeholder = `(${f.value.map(() => '?').join(', ')})`;
        } else if (f.operator == AdminForthFilterOperators.ILIKE) {
          placeholder = `LOWER(?)`;
          field = `LOWER(${f.field})`;
          operator = 'LIKE';
        }

        return `${field} ${operator} ${placeholder}`
      }).join(' AND ')}` : '';

      const filterValues = [];
      
      filters.length ? filters.forEach((f) => {
        // for arrays do set in map
        const v = f.value;

        if (f.operator == AdminForthFilterOperators.LIKE || f.operator == AdminForthFilterOperators.ILIKE) {
          filterValues.push(`%${v}%`);
        } else if (f.operator == AdminForthFilterOperators.IN || f.operator == AdminForthFilterOperators.NIN) {
          filterValues.push(...v);
        } else {
          filterValues.push(v);
        }
      }) : [];

      const orderBy = sort.length ? `ORDER BY ${sort.map((s) => `${s.field} ${this.SortDirectionsMap[s.direction]}`).join(', ')}` : '';
      

      const q = `SELECT ${columns} FROM ${tableName} ${where} ${orderBy} LIMIT ? OFFSET ?`;
      const stmt = this.db.prepare(q);
      const d = [...filterValues, limit, offset];

      if (process.env.HEAVY_DEBUG) {
        console.log('🪲 SQLITE Query', q, 'params:', d);
      }
      const rows = await stmt.all(d);

      const total = (
        await this.db.prepare(`SELECT COUNT(*) FROM ${tableName} ${where}`).get([...filterValues])
      )['COUNT(*)'];

      return {
        data: rows.map((row) => {
          const newRow = {};
          for (const [key, value] of Object.entries(row)) {
            newRow[key] = value;
          }
          return newRow;
        }),
        total,
      };
    }

    async getMinMaxForColumnsWithOriginalTypes({ resource, columns }: { resource: AdminForthResource, columns: AdminForthResourceColumn[] }): Promise<{ [key: string]: { min: any, max: any } }> {
      const tableName = resource.table;
      const result = {};
      await Promise.all(columns.map(async (col) => {
        const stmt = await this.db.prepare(`SELECT MIN(${col.name}) as min, MAX(${col.name}) as max FROM ${tableName}`);
        const { min, max } = stmt.get();
        result[col.name] = {
          min, max,
        };
      }))
      return result;
    }

    async createRecord({ resource, record }: { resource: AdminForthResource, record: any }) {
      const tableName = resource.table;
      const columns = Object.keys(record);
      const placeholders = columns.map(() => '?').join(', ');
      const values = columns.map((colName) => record[colName]);
      const q = this.db.prepare(`INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders})`)
      await q.run(values);
    }

    async updateRecord({ resource, recordId, newValues }: { resource: AdminForthResource, recordId: any, newValues: any }) {
      const columnsWithPlaceholders = Object.keys(newValues).map((col) => `${col} = ?`);
      const values = [...Object.values(newValues), recordId];

      const q = this.db.prepare(
          `UPDATE ${resource.table} SET ${columnsWithPlaceholders} WHERE ${this.getPrimaryKey(resource)} = ?`
      )
      await q.run(values);
    }

    async deleteRecord({ resource, recordId }: { resource: AdminForthResource, recordId: any }) {
      const q = this.db.prepare(`DELETE FROM ${resource.table} WHERE ${this.getPrimaryKey(resource)} = ?`);
      await q.run(recordId);
    }

    close() {
      this.db.close();
    }
}

export default SQLiteConnector;