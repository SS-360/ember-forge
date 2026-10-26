import java.io.*;
import java.sql.*;
import java.nio.charset.StandardCharsets;
public class ZetarisJdbc {
  static String quote(String s) { if(s==null)return "null"; StringBuilder b=new StringBuilder("\"");for(char c:s.toCharArray()){switch(c){case '"':b.append("\\\"");break;case '\\':b.append("\\\\");break;case '\n':b.append("\\n");break;case '\r':b.append("\\r");break;case '\t':b.append("\\t");break;default:if(c<32)b.append(String.format("\\u%04x",(int)c));else b.append(c);}}return b.append('"').toString(); }
  public static void main(String[] args) throws Exception {
    BufferedReader in=new BufferedReader(new InputStreamReader(System.in,StandardCharsets.UTF_8));String user=in.readLine(),password=in.readLine(),url=in.readLine();StringBuilder sql=new StringBuilder();String line;while((line=in.readLine())!=null)sql.append(line).append('\n');
    try {Class.forName("com.zetaris.lightning.jdbc.LightningDriver");try(Connection conn=DriverManager.getConnection(url,user,password);Statement statement=conn.createStatement()){statement.setQueryTimeout(45);statement.setMaxRows(5001);boolean has=statement.execute(sql.toString());StringBuilder out=new StringBuilder("{\"records\":[");int count=0;if(has){try(ResultSet r=statement.getResultSet()){ResultSetMetaData m=r.getMetaData();while(r.next()){if(++count>5000)throw new IllegalStateException("ROW_LIMIT_EXCEEDED");if(count>1)out.append(',');out.append('{');for(int n=1;n<=m.getColumnCount();n++){if(n>1)out.append(',');out.append(quote(m.getColumnLabel(n))).append(':').append(quote(r.getString(n)));}out.append('}');}}}System.out.println(out.append("],\"rowCount\":").append(count).append('}'));}}
    catch(Exception e){String message=String.valueOf(e.getMessage());if(password!=null&&!password.isEmpty())message=message.replace(password,"[redacted]");if(user!=null&&!user.isEmpty())message=message.replace(user,"[redacted]");System.out.println("{\"error\":"+quote(e.getClass().getSimpleName())+",\"message\":"+quote(message.substring(0,Math.min(message.length(),1800)))+"}");System.exit(1);}
  }
}
