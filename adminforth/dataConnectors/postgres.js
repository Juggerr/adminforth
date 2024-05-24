import { AdminForthTypes } from '../types.js';
import dayjs from 'dayjs';
import pkg from 'pg';
const { Client } = pkg;


class PostgresConnector {
    constructor({ url }) {
        this.db = new Client({
            connectionString: url
        });
        (async () => {
            await this.db.connect();
        })();
    }

    async discoverFields(tableName) {
        const stmt = await this.db.query(`
        SELECT
            a.attname AS name,
            pg_catalog.format_type(a.atttypid, a.atttypmod) AS type,
            a.attnotnull AS notnull,
            COALESCE(pg_get_expr(d.adbin, d.adrelid), '') AS dflt_value,
            CASE
                WHEN ct.contype = 'p' THEN 1
                ELSE 0
            END AS pk
        FROM
            pg_catalog.pg_attribute a
        LEFT JOIN pg_catalog.pg_attrdef d ON a.attrelid = d.adrelid AND a.attnum = d.adnum
        LEFT JOIN pg_catalog.pg_constraint ct ON a.attnum = ANY (ct.conkey) AND a.attrelid = ct.conrelid
        LEFT JOIN pg_catalog.pg_class c ON a.attrelid = c.oid
        LEFT JOIN pg_catalog.pg_namespace n ON c.relnamespace = n.oid
        WHERE
            c.relname = $1
            AND a.attnum > 0
            AND NOT a.attisdropped
        ORDER BY
            a.attnum;
    `, [tableName]);
        const rows = stmt.rows;
        const fieldTypes = {};

        rows.forEach((row) => {
          const field = {};
          const baseType = row.type.toLowerCase();
          if (baseType == 'int') {
            field.type = AdminForthTypes.INTEGER;
            field._underlineType = 'int';

          } else if (baseType.includes('character varying')) {
            field.type = AdminForthTypes.STRING;
            field._underlineType = 'varchar';
            const length = baseType.match(/\d+/);
            field.maxLength = length ? parseInt(length[0]) : null;

          } else if (baseType == 'text') {
            field.type = AdminForthTypes.TEXT;
            field._underlineType = 'text';

          } else if (baseType.includes('decimal(')) {
            field.type = AdminForthTypes.DECIMAL;
            field._underlineType = 'decimal';
            const [precision, scale] = baseType.match(/\d+/g);
            field.precision = parseInt(precision);
            field.scale = parseInt(scale);

          } else if (baseType == 'real') {
            field.type = AdminForthTypes.FLOAT;
            field._underlineType = 'real';

          } else if (baseType == 'date') {
            field.type = AdminForthTypes.DATETIME;
            field._underlineType = 'timestamp';

          } else {
            field.type = 'unknown'
          }
          field._baseTypeDebug = baseType;
          field.required = !row.notnull == 1;
          field.primaryKey = row.pk == 1;
          field.default = row.dflt_value;
          fieldTypes[row.name] = field
        });
        return fieldTypes;
    }

    getFieldValue(field, value) {
        if (field.type == AdminForthTypes.DATETIME) {
          if (!value) {
            return null;
          }
          if (field._underlineType == 'timestamp' || field._underlineType == 'int') {
            return dayjs.unix(+value).toISOString();
          } else if (field._underlineType == 'varchar') {
            return dayjs.unix(+value).toISOString();
          } else {
            throw new Error(`AdminForth does not support row type: ${field._underlineType} for timestamps, use VARCHAR (with iso strings) or TIMESTAMP/INT (with unix timestamps)`);
          }
        }


        return value;
      }

    setFieldValue(field, value) {
      if (field.type == AdminForthTypes.TIMESTAMP) {
        if (field._underlineType == 'timestamp' || field._underlineType == 'int') {
          // value is iso string now, convert to unix timestamp
          return dayjs(value).unix();
        } else if (field._underlineType == 'varchar') {
          // value is iso string now, convert to unix timestamp
          return dayjs(value).toISOString();
        }
      }
    }
    
    async getData({ resource, limit, offset, sort, filters }) {
      const columns = resource.columns.map((col) => col.name).join(', ');
      const tableName = resource.table;
      
      for (const filter of filters) {
        if (!this.OperatorsMap[filter.operator]) {
          throw new Error(`Operator ${filter.operator} is not allowed`);
        }

        if (resource.columns.some((col) => col.name == filter.field)) {
          throw new Error(`Field ${filter.field} is not in resource ${resource.resourceId}`);
        }
      }

      const where = filters.length ? `WHERE ${filters.map((f, i) => `${f.field} ${this.OperatorsMap[f.operator]} ?`).join(' AND ')}` : '';
      // const filterValues = filters.length ? filters.map((f) => f.value) : [];

      const orderBy = sort.length ? `ORDER BY ${sort.map((s) => `${s.field} ${this.SortDirectionsMap[s.direction]}`).join(', ')}` : '';
      const stmt = await this.db.query(`SELECT ${columns} FROM ${tableName} ${where} ${orderBy}  LIMIT ${limit} OFFSET ${offset}`);
      const rows = stmt.rows;
      
      const total = (await this.db.query(`SELECT COUNT(*) FROM ${tableName} ${where}`)).rows[0].count;
      // run all fields via getFieldValue
      return {
        data: rows.map((row) => {
          const newRow = {};
          for (const [key, value] of Object.entries(row)) {
              newRow[key] = this.getFieldValue(resource.columns.find((col) => col.name == key), value);
          }
          return newRow;
        }),
        total,
      };
    }
  

    async close() {
        await this.db.end();
    }
}

export default PostgresConnector;